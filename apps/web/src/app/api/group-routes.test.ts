import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/server/http/errors';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(), listGroups: vi.fn(), createGroup: vi.fn(), getGroup: vi.fn(),
  updateGroup: vi.fn(), deleteGroup: vi.fn(), listMembers: vi.fn(), addMember: vi.fn(),
  removeMember: vi.fn(), createTicket: vi.fn(), completeImage: vi.fn(),
}));
vi.mock('@/server/auth/session', () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock('@/server/groups/group-service', () => ({
  listGroups: mocks.listGroups, createGroup: mocks.createGroup, getGroup: mocks.getGroup,
  updateGroup: mocks.updateGroup, deleteGroup: mocks.deleteGroup, listMembers: mocks.listMembers,
  addMember: mocks.addMember, removeMember: mocks.removeMember,
  createGroupImageTicket: mocks.createTicket, completeGroupImage: mocks.completeImage,
}));

import { GET as groupsGet, POST as groupsPost } from './v1/groups/route';
import { GET as groupGet, PATCH as groupPatch, DELETE as groupDelete } from './v1/groups/[groupId]/route';
import { GET as membersGet, POST as membersPost } from './v1/groups/[groupId]/members/route';
import { DELETE as memberDelete } from './v1/groups/[groupId]/members/[userId]/route';
import { POST as ticketPost } from './v1/groups/[groupId]/image/upload-ticket/route';
import { POST as completePost } from './v1/groups/[groupId]/image/complete/route';

const groupId = '00000000-0000-4000-8000-000000000201';
const userId = '00000000-0000-4000-8000-000000000202';
const context = { params: Promise.resolve({ groupId }) };
const memberContext = { params: Promise.resolve({ groupId, userId }) };
const group = { id: groupId, name: 'Trip', currentUserRole: 'admin' };

function mutation(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, extra?: HeadersInit): Request {
  return new Request(`https://expenso.example${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      origin: 'https://expenso.example', 'sec-fetch-site': 'same-origin',
      cookie: 'expenso.csrf=group-route-token', 'x-csrf-token': 'group-route-token', ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://rspuqbcgjqezimwwpbzl.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://expenso.example';
  mocks.requireApiUser.mockResolvedValue({ client: {}, userId, email: 'demo@example.com' });
  mocks.listGroups.mockResolvedValue({ groups: [group], nextCursor: null });
  mocks.createGroup.mockResolvedValue(group); mocks.getGroup.mockResolvedValue(group); mocks.updateGroup.mockResolvedValue(group);
  mocks.listMembers.mockResolvedValue([]); mocks.addMember.mockResolvedValue({ userId });
  mocks.createTicket.mockResolvedValue({ path: `${groupId}/cover-x.webp` }); mocks.completeImage.mockResolvedValue(group);
});

describe('group routes', () => {
  it('lists, creates, gets, and updates groups with strict schema', async () => {
    expect((await groupsGet(new Request('https://expenso.example/api/v1/groups?limit=10'))).status).toBe(200);
    expect((await groupsPost(mutation('/api/v1/groups', 'POST', { name: ' Trip ', description: null }))).status).toBe(201);
    expect(mocks.createGroup).toHaveBeenCalledWith({}, { name: 'Trip', description: null });
    expect((await groupGet(new Request(`https://expenso.example/api/v1/groups/${groupId}`), context)).status).toBe(200);
    expect((await groupPatch(mutation(`/api/v1/groups/${groupId}`, 'PATCH', { simplifiedDebts: false }), context)).status).toBe(200);
    expect((await groupPatch(mutation(`/api/v1/groups/${groupId}`, 'PATCH', { createdBy: userId }), context)).status).toBe(422);
  });

  it('adds exact normalized emails and removes a member', async () => {
    expect((await membersGet(new Request(`https://expenso.example/api/v1/groups/${groupId}/members`), context)).status).toBe(200);
    expect((await membersPost(mutation(`/api/v1/groups/${groupId}/members`, 'POST', { email: ' MEMBER@Example.COM ' }), context)).status).toBe(201);
    expect(mocks.addMember).toHaveBeenCalledWith({}, groupId, 'member@example.com');
    expect((await memberDelete(mutation(`/api/v1/groups/${groupId}/members/${userId}`, 'DELETE'), memberContext)).status).toBe(200);
  });

  it('handles group image ticket/completion and safe deletion', async () => {
    expect((await ticketPost(mutation(`/api/v1/groups/${groupId}/image/upload-ticket`, 'POST', { contentType: 'image/webp', sizeBytes: 1024 }), context)).status).toBe(201);
    expect((await completePost(mutation(`/api/v1/groups/${groupId}/image/complete`, 'POST', { path: `${groupId}/cover-00000000-0000-4000-8000-000000000203.webp` }), context)).status).toBe(200);
    expect((await groupDelete(mutation(`/api/v1/groups/${groupId}`, 'DELETE'), context)).status).toBe(200);
  });

  it('preserves precise lifecycle errors', async () => {
    mocks.addMember.mockRejectedValueOnce(new AppError({ code: 'MEMBER_ALREADY_EXISTS', status: 409 }));
    const duplicate = await membersPost(mutation(`/api/v1/groups/${groupId}/members`, 'POST', { email: 'member@example.com' }), context);
    expect((await duplicate.json()).error.code).toBe('MEMBER_ALREADY_EXISTS');
    mocks.deleteGroup.mockRejectedValueOnce(new AppError({ code: 'GROUP_HISTORY_RETAINED', status: 409 }));
    const retained = await groupDelete(mutation(`/api/v1/groups/${groupId}`, 'DELETE'), context);
    expect((await retained.json()).error.code).toBe('GROUP_HISTORY_RETAINED');
  });

  it('rejects cross-origin mutation before domain code', async () => {
    const response = await groupsPost(mutation('/api/v1/groups', 'POST', { name: 'Trip' }, { origin: 'https://evil.example' }));
    expect(response.status).toBe(403);
    expect(mocks.createGroup).not.toHaveBeenCalled();
  });

  it('requires verified session for all group routes', async () => {
    mocks.requireApiUser.mockRejectedValue(new AppError({ code: 'AUTH_REQUIRED', status: 401 }));
    const responses = await Promise.all([
      groupsGet(new Request('https://expenso.example/api/v1/groups')),
      groupsPost(mutation('/api/v1/groups', 'POST', {})),
      groupGet(new Request(`https://expenso.example/api/v1/groups/${groupId}`), context),
      groupPatch(mutation(`/api/v1/groups/${groupId}`, 'PATCH', {}), context),
      groupDelete(mutation(`/api/v1/groups/${groupId}`, 'DELETE'), context),
      membersGet(new Request(`https://expenso.example/api/v1/groups/${groupId}/members`), context),
      membersPost(mutation(`/api/v1/groups/${groupId}/members`, 'POST', {}), context),
      memberDelete(mutation(`/api/v1/groups/${groupId}/members/${userId}`, 'DELETE'), memberContext),
      ticketPost(mutation(`/api/v1/groups/${groupId}/image/upload-ticket`, 'POST', {}), context),
      completePost(mutation(`/api/v1/groups/${groupId}/image/complete`, 'POST', {}), context),
    ]);
    expect(responses.every((response) => response.status === 401)).toBe(true);
  });
});
