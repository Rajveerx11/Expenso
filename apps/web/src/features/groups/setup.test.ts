import { describe, expect, it, vi } from 'vitest';
import { createGroupSetupTasks, createOrRetryGroupSetup, PENDING_MEMBER_EMAIL_ERROR, resolveGroupSetupEmails } from './setup';

describe('partial group setup retry', () => {
  it('includes a valid normalized visible email and blocks invalid unfinished input', () => {
    const isValid = (email: string) => email.includes('@') && email.includes('.');

    expect(resolveGroupSetupEmails(['done@example.com'], '  NEW@Example.COM  ', isValid)).toEqual({
      emails: ['done@example.com', 'new@example.com'],
    });
    expect(resolveGroupSetupEmails(['done@example.com'], ' DONE@EXAMPLE.COM ', isValid)).toEqual({
      emails: ['done@example.com'],
    });
    expect(resolveGroupSetupEmails(['done@example.com'], 'unfinished', isValid)).toEqual({
      emails: ['done@example.com'],
      error: PENDING_MEMBER_EMAIL_ERROR,
    });
  });

  it('creates the group once and retries only failed member/image operations', async () => {
    const image = new File(['image'], 'group.png', { type: 'image/png' });
    const createGroup = vi.fn().mockResolvedValue({ id: 'group-1' });
    const addMember = vi.fn(async (_groupId: string, email: string) => {
      if (email === 'retry@example.com' && addMember.mock.calls.filter((call) => call[1] === email).length === 1) {
        throw new Error('member unavailable');
      }
    });
    const uploadImage = vi.fn()
      .mockRejectedValueOnce(new Error('upload unavailable'))
      .mockResolvedValue(undefined);
    const dependencies = {
      groupInput: { name: 'Trip', description: null },
      createGroup,
      addMember,
      uploadImage,
      errorMessage: (error: unknown) => error instanceof Error ? error.message : 'failed',
    };

    const first = await createOrRetryGroupSetup({
      ...dependencies,
      existingGroupId: null,
      tasks: createGroupSetupTasks(['done@example.com', 'retry@example.com'], image),
    });

    expect(createGroup).toHaveBeenCalledOnce();
    expect(first.tasks.map(({ status }) => status)).toEqual(['succeeded', 'failed', 'failed']);

    const retried = await createOrRetryGroupSetup({
      ...dependencies,
      existingGroupId: first.groupId,
      tasks: first.tasks,
    });

    expect(createGroup).toHaveBeenCalledOnce();
    expect(addMember.mock.calls.filter((call) => call[1] === 'done@example.com')).toHaveLength(1);
    expect(addMember.mock.calls.filter((call) => call[1] === 'retry@example.com')).toHaveLength(2);
    expect(uploadImage).toHaveBeenCalledTimes(2);
    expect(uploadImage).toHaveBeenLastCalledWith('group-1', image);
    expect(retried.tasks.every(({ status }) => status === 'succeeded')).toBe(true);
  });

  it('treats MEMBER_ALREADY_EXISTS after commit-then-response-loss as a successful retry', async () => {
    const createGroup = vi.fn().mockResolvedValue({ id: 'group-1' });
    const addMember = vi.fn()
      .mockRejectedValueOnce(new Error('connection closed after commit'))
      .mockRejectedValueOnce({ code: 'MEMBER_ALREADY_EXISTS' });
    const dependencies = {
      groupInput: { name: 'Trip', description: null },
      createGroup,
      addMember,
      uploadImage: vi.fn(),
      errorMessage: () => 'temporary failure',
    };

    const first = await createOrRetryGroupSetup({
      ...dependencies,
      existingGroupId: null,
      tasks: createGroupSetupTasks(['member@example.com'], null),
    });
    expect(first.tasks[0]).toMatchObject({ kind: 'member', status: 'failed' });

    const retried = await createOrRetryGroupSetup({
      ...dependencies,
      existingGroupId: first.groupId,
      tasks: first.tasks,
    });

    expect(createGroup).toHaveBeenCalledOnce();
    expect(addMember).toHaveBeenCalledTimes(2);
    expect(retried.tasks[0]).toMatchObject({ kind: 'member', status: 'succeeded' });
  });

  it('treats the creator self-email duplicate as already complete', async () => {
    const createGroup = vi.fn().mockResolvedValue({ id: 'group-1' });
    const addMember = vi.fn().mockRejectedValue({ code: 'MEMBER_ALREADY_EXISTS' });

    const result = await createOrRetryGroupSetup({
      existingGroupId: null,
      groupInput: { name: 'Trip', description: null },
      tasks: createGroupSetupTasks(['creator@example.com'], null),
      createGroup,
      addMember,
      uploadImage: vi.fn(),
      errorMessage: () => 'duplicate',
    });

    expect(createGroup).toHaveBeenCalledOnce();
    expect(addMember).toHaveBeenCalledOnce();
    expect(result.tasks[0]).toMatchObject({ kind: 'member', status: 'succeeded' });
  });
});
