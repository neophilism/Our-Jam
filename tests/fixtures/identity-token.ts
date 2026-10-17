// Deliberately unsigned fixture; accepted only by the loopback integration server.
export const fixtureIdentityToken = `${Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "browser-identity", exp: 4102444800 })).toString("base64url")}.fixture-signature`;
