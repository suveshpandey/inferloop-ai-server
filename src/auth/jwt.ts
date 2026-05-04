import {SignJWT, jwtVerify} from 'jose';
import {env} from '../config/env.js';

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export type AccessTokenPayload = {
    sub: string;   //user id
    email: string
};

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return new SignJWT({
        email: payload.email
    })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(secret)
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const {payload} = await jwtVerify(token, secret);
    return {
        sub: payload.sub as string,
        email: payload.email as string,
    };
}