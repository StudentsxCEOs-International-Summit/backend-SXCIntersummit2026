import { OAuth2Client } from 'google-auth-library'
import { env } from '../configs/env'

export const googleOAuthClient = new OAuth2Client({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: env.GOOGLE_REDIRECT_URI,
})

export function getGoogleAuthUrl(state?: string): string {
  return googleOAuthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
  })
}

export interface GoogleUserInfo {
  id: string
  email: string
  name: string
  picture?: string
}

export async function getGoogleUserFromCode(code: string): Promise<GoogleUserInfo> {
  const { tokens } = await googleOAuthClient.getToken(code)
  googleOAuthClient.setCredentials(tokens)

  if (!tokens.id_token) {
    throw new Error('ID Token not returned by Google')
  }

  const ticket = await googleOAuthClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  })

  const payload = ticket.getPayload()
  if (!payload || !payload.email) {
    throw new Error('Google payload does not contain verified email')
  }

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name || 'Google User',
    picture: payload.picture,
  }
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleUserInfo> {
  const ticket = await googleOAuthClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  })

  const payload = ticket.getPayload()
  if (!payload || !payload.email) {
    throw new Error('Invalid Google token: email not found')
  }

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name || 'Google User',
    picture: payload.picture,
  }
}
