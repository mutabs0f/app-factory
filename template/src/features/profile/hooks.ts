import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyProfile, updateMyProfile, type ProfileUpdate } from '@/features/profile/api';

const profileKey = (userId: string) => ['profile', userId] as const;

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: profileKey(userId ?? 'anon'),
    queryFn: () => getMyProfile(userId as string),
    enabled: !!userId,
  });
}

export function useUpdateProfile(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfileUpdate) => updateMyProfile(userId, patch),
    onSuccess: (data) => {
      queryClient.setQueryData(profileKey(userId), data);
    },
  });
}
