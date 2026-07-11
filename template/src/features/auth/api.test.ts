import { sendOtp, verifyOtp } from '@/features/auth/api';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithOtp: jest.fn(), verifyOtp: jest.fn() } },
}));

const auth = supabase.auth as unknown as {
  signInWithOtp: jest.Mock;
  verifyOtp: jest.Mock;
};

describe('sendOtp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trims the email and calls signInWithOtp', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    await sendOtp('  me@example.com  ');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'me@example.com' });
  });

  it('throws when Supabase returns an error', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: new Error('rate limited') });
    await expect(sendOtp('me@example.com')).rejects.toThrow('rate limited');
  });
});

describe('verifyOtp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('succeeds with type "email" for returning users (no fallback call)', async () => {
    auth.verifyOtp.mockResolvedValueOnce({ error: null });
    await verifyOtp('  me@example.com  ', ' 123456 ');
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: 'me@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('falls back to type "signup" for first-time users on a 4xx failure', async () => {
    auth.verifyOtp
      .mockResolvedValueOnce({ error: { status: 403, message: 'invalid' } })
      .mockResolvedValueOnce({ error: null });
    await verifyOtp('new@example.com', '654321');
    expect(auth.verifyOtp).toHaveBeenCalledTimes(2);
    expect(auth.verifyOtp).toHaveBeenNthCalledWith(1, {
      email: 'new@example.com',
      token: '654321',
      type: 'email',
    });
    expect(auth.verifyOtp).toHaveBeenNthCalledWith(2, {
      email: 'new@example.com',
      token: '654321',
      type: 'signup',
    });
  });

  it('throws the FIRST error when both attempts fail', async () => {
    auth.verifyOtp
      .mockResolvedValueOnce({ error: { status: 403, message: 'first-invalid' } })
      .mockResolvedValueOnce({ error: { status: 403, message: 'second-invalid' } });
    await expect(verifyOtp('x@example.com', '000000')).rejects.toMatchObject({
      message: 'first-invalid',
    });
    expect(auth.verifyOtp).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on rate-limit (429) — one call, surfaces the error', async () => {
    auth.verifyOtp.mockResolvedValueOnce({ error: { status: 429, message: 'rate limited' } });
    await expect(verifyOtp('x@example.com', '000000')).rejects.toMatchObject({
      message: 'rate limited',
    });
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on a network/5xx error — one call', async () => {
    auth.verifyOtp.mockResolvedValueOnce({ error: { status: 0, message: 'network down' } });
    await expect(verifyOtp('x@example.com', '000000')).rejects.toMatchObject({
      message: 'network down',
    });
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
  });
});
