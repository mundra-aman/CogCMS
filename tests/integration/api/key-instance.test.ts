import { expect, it, vi } from 'vitest';
import { authenticateApiKey, issueApiKey } from '@/lib/auth/api-key';
import ApiKey from '@/models/ApiKey';
import { createTestSite, createTestUser } from '@/tests/setup/factories';

it('a warm instance observes revocation and shortened expiry written by another instance', async () => {
  const site = await createTestSite();
  const user = await createTestUser();
  const issued = await issueApiKey({
    siteId: site._id,
    createdBy: user._id,
    name: 'instance',
    scopes: ['intake:write'],
  });
  const request = { headers: new Headers({ authorization: `Bearer ${issued.plaintext}` }) };
  await authenticateApiKey(request, 'intake:write');
  vi.resetModules();
  const otherInstance = await import('@/lib/auth/api-key');
  await otherInstance.revokeApiKey(issued.key._id.toString());
  await expect(authenticateApiKey(request, 'intake:write')).rejects.toThrow('Unauthorized');
  await ApiKey.updateOne({ _id: issued.key._id }, { $set: { revokedAt: null } });
  await authenticateApiKey(request, 'intake:write');
  await ApiKey.updateOne(
    { _id: issued.key._id },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  await expect(authenticateApiKey(request, 'intake:write')).rejects.toThrow('Unauthorized');
});
