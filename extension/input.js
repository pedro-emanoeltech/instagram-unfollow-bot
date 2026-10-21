globalThis.validateLocalInput = data => {
  const valid = name => typeof name === 'string' && /^[a-z0-9._]{1,30}$/.test(name);
  if (!data || data.source !== 'instagram-export' || !valid(data.account) || !Array.isArray(data.users) ||
    !data.users.every(valid) || !Array.isArray(data.protectedFollowers) || !data.protectedFollowers.every(valid) ||
    !Number.isSafeInteger(data.followers) || !Number.isSafeInteger(data.following) ||
    data.followers < 0 || data.following < 0 || new Set(data.protectedFollowers).size !== data.followers)
    throw new Error('Formato inválido. Consulte o README.');
  // Only copy schema fields; discard unknown fields rather than store credentials accidentally.
  return {source:data.source,account:data.account,users:[...new Set(data.users)],
    following:data.following,followers:data.followers,protectedFollowers:[...new Set(data.protectedFollowers)]};
};
