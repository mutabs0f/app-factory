import { sendOtp, verifyOtp } from '@/features/auth/api';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithOtp: jest.fn(), verifyOtp: jest.fn() } },
}));

const auth = supabase.auth as unknown as {
  signInWithOtp: jest.Mock;
  verifyOtp: jest.Mock;
};

describe('auth api (email OTP)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sendOtp trims the email and calls signInWithOtp', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    await sendOtp('  me@example.com  ');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'me@example.com' });
  });

  it('sendOtp throws when Supabase returns an error', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: new Error('rate limited') });
    await expect(sendOtp('me@example.com')).rejects.toThrow('rate limited');
  });

  it('verifyOtp passes type "email"', async () => {
    auth.verifyOtp.mockResolvedValue({ error: null });
    await verifyOtp('me@example.com', '123456');
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: 'me@example.com',
      token: '123456',
      type: 'email',
    });
  });
});
