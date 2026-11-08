export type GroupSetupTask =
  | { id: string; kind: 'member'; email: string; status: 'pending' | 'succeeded' | 'failed'; error?: string }
  | { id: string; kind: 'image'; file: File; status: 'pending' | 'succeeded' | 'failed'; error?: string };

export const PENDING_MEMBER_EMAIL_ERROR = 'Enter a valid member email or clear the unfinished email before creating the group.';

export function createGroupSetupTasks(emails: string[], image: File | null): GroupSetupTask[] {
  return [
    ...emails.map((email): GroupSetupTask => ({
      id: `member:${email}`,
      kind: 'member',
      email,
      status: 'pending',
    })),
    ...(image ? [{ id: 'image', kind: 'image' as const, file: image, status: 'pending' as const }] : []),
  ];
}

export function resolveGroupSetupEmails(
  committedEmails: string[],
  visibleInput: string,
  isValid: (email: string) => boolean,
): { emails: string[]; error?: string } {
  const emails = [...new Set(committedEmails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const pendingEmail = visibleInput.trim().toLowerCase();
  if (!pendingEmail) return { emails };
  if (!isValid(pendingEmail)) {
    return {
      emails,
      error: PENDING_MEMBER_EMAIL_ERROR,
    };
  }
  return { emails: emails.includes(pendingEmail) ? emails : [...emails, pendingEmail] };
}

export function memberSetupAlreadyComplete(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'MEMBER_ALREADY_EXISTS';
}

export async function createOrRetryGroupSetup(options: {
  existingGroupId: string | null;
  groupInput: { name: string; description: string | null };
  tasks: GroupSetupTask[];
  createGroup: (input: { name: string; description: string | null }) => Promise<{ id: string }>;
  addMember: (groupId: string, email: string) => Promise<unknown>;
  uploadImage: (groupId: string, file: File) => Promise<unknown>;
  errorMessage: (error: unknown) => string;
  onGroupReady?: (groupId: string) => void;
  onTasksChange?: (tasks: GroupSetupTask[]) => void;
}): Promise<{ groupId: string; tasks: GroupSetupTask[] }> {
  const groupId = options.existingGroupId
    ?? (await options.createGroup(options.groupInput)).id;
  options.onGroupReady?.(groupId);

  let tasks = options.tasks.map((task) => (
    task.status === 'succeeded' ? task : { ...task, status: 'pending' as const, error: undefined }
  ));
  options.onTasksChange?.(tasks);

  for (const task of tasks) {
    if (task.status === 'succeeded') continue;
    try {
      if (task.kind === 'member') await options.addMember(groupId, task.email);
      else await options.uploadImage(groupId, task.file);
      tasks = tasks.map((current) => current.id === task.id
        ? { ...current, status: 'succeeded' as const, error: undefined }
        : current);
    } catch (error) {
      tasks = tasks.map((current) => {
        if (current.id !== task.id) return current;
        if (task.kind === 'member' && memberSetupAlreadyComplete(error)) {
          return { ...current, status: 'succeeded' as const, error: undefined };
        }
        return { ...current, status: 'failed' as const, error: options.errorMessage(error) };
      });
    }
    options.onTasksChange?.(tasks);
  }

  return { groupId, tasks };
}
