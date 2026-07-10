import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { getMyProfile } from '@/features/profile/api';
import { useProfile } from '@/features/profile/hooks';

jest.mock('@/features/profile/api', () => ({
  getMyProfile: jest.fn(),
  updateMyProfile: jest.fn(),
}));

const mockedGetMyProfile = getMyProfile as jest.Mock;

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useProfile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stays idle and does not fetch when userId is undefined', async () => {
    const { result } = await renderHook(() => useProfile(undefined), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedGetMyProfile).not.toHaveBeenCalled();
  });

  it('fetches and returns the profile for a user', async () => {
    mockedGetMyProfile.mockResolvedValue({
      id: 'u1',
      display_name: 'Basim',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    const { result } = await renderHook(() => useProfile('u1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.display_name).toBe('Basim');
    expect(mockedGetMyProfile).toHaveBeenCalledWith('u1');
  });
});
