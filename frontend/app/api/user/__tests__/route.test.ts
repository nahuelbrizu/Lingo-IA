import { GET } from '../route';
import { getServerSession } from 'next-auth';
import { getUserData } from '../../../../lib/db';
import { NextResponse } from 'next/server';

// Mock dependencies
vi.mock('next-auth');
vi.mock('../../../../lib/db');

describe('GET /api/user', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if the user is not authenticated', async () => {
    (getServerSession as vi.Mock).mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Not authenticated');
  });

  it('should return user data if the user is authenticated', async () => {
    const mockSession = { user: { id: 'test-user-id' } };
    const mockUserData = { name: 'Test User', languageLevel: 'B2' };

    (getServerSession as vi.Mock).mockResolvedValue(mockSession);
    (getUserData as vi.Mock).mockResolvedValue(mockUserData);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(mockUserData);
    expect(getUserData).toHaveBeenCalledWith('test-user-id');
  });

  it('should return 500 if there is a database error', async () => {
    const mockSession = { user: { id: 'test-user-id' } };
    (getServerSession as vi.Mock).mockResolvedValue(mockSession);
    (getUserData as vi.Mock).mockRejectedValue(new Error('DB Error'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Internal server error');
  });
});
