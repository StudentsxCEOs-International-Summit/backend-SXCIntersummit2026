import { env } from '../configs/env'

export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'StudentsxCEOs International Summit 2026 - API Documentation',
    version: '1.0.0',
    description: `
REST API documentation for **SxC International Summit 2026** backend system.

### Authentication Overview
- **User Types**: Regular Participants (\`USER\`) & Committee/Staff (\`STAFF\` / Admin).
- **Session Mechanism**: Dual authentication support via HTTP-Only Secure Cookie (\`token\`) and \`Authorization: Bearer <token>\` header.
- **Revocation**: Stateful token blacklisting on \`POST /api/auth/logout\` with automated hourly garbage collection for expired entries.
    `,
    contact: {
      name: 'StudentsxCEOs IT & Tech Team',
      url: 'https://sxcintersummit.com',
    },
  },
  servers: [
    {
      url: env.APP_URL || 'http://localhost:3000',
      description: 'Current Environment API Server',
    },
  ],
  tags: [
    {
      name: 'Auth - Registration Flow',
      description: 'Account registration, registration OTP verification, and OTP resend',
    },
    {
      name: 'Auth - Password Reset Flow',
      description: 'Password reset request, OTP verification to acquire reset token, and password updating',
    },
    {
      name: 'Auth - Session Management',
      description: 'Participant login, staff/admin login, token revocation (logout), and active user profile',
    },
    {
      name: 'Auth - Google OAuth',
      description: 'Google OAuth 2.0 authentication flow (Authorization URL, callback handling, and token verification)',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide your JWT bearer token in the format: `Bearer <token>`',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'token',
        description: 'HTTP-Only session cookie containing the JWT authentication token',
      },
    },
    schemas: {
      ApiResponseSuccess: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Operation completed successfully.' },
          data: { type: 'object', nullable: true },
        },
      },
      ApiErrorResponse: {
        type: 'object',
        required: ['success', 'message'],
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Verification data for this email was not found or has expired' },
        },
      },
      ApiValidationErrorResponse: {
        type: 'object',
        required: ['success', 'message', 'errors'],
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Validation error' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'invalid_string' },
                message: { type: 'string', example: 'Password must contain at least one uppercase letter' },
                path: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['password'],
                },
              },
            },
          },
        },
      },
      RegisterInput: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: {
            type: 'string',
            minLength: 2,
            maxLength: 100,
            example: 'John Doe',
          },
          email: {
            type: 'string',
            format: 'email',
            example: 'masheinrich@gmail.com',
          },
          password: {
            type: 'string',
            minLength: 8,
            maxLength: 64,
            description: 'Must include at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 symbol.',
            example: 'Password123!',
          },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            example: 'user@sxcintersummit.com',
          },
          password: {
            type: 'string',
            example: 'password123',
          },
        },
      },
      OtpInput: {
        type: 'object',
        required: ['email', 'otp'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            example: 'masheinrich@gmail.com',
          },
          otp: {
            type: 'string',
            pattern: '^[0-9]{6}$',
            minLength: 6,
            maxLength: 6,
            description: '6-digit OTP code received via email',
            example: '423310',
          },
        },
      },
      ResendOtpInput: {
        type: 'object',
        required: ['email'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            example: 'masheinrich@gmail.com',
          },
        },
      },
      ForgotPasswordInput: {
        type: 'object',
        required: ['email'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            example: 'masheinrich@gmail.com',
          },
        },
      },
      ResetPasswordInput: {
        type: 'object',
        required: ['password'],
        properties: {
          password: {
            type: 'string',
            minLength: 8,
            maxLength: 64,
            description: 'Must include at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 symbol.',
            example: 'NewPassword123!',
          },
          token: {
            type: 'string',
            description: 'Optional if provided via Authorization header or query parameter',
            example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          },
        },
      },
    },
  },
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['Auth - Registration Flow'],
        summary: 'Register a new participant',
        description: 'Initiates user registration by validating inputs, creating a pending verification record, and sending a 6-digit OTP code to the provided email address.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterInput' },
            },
          },
        },
        responses: {
          201: {
            description: 'Registration initiated successfully. Verification OTP has been sent.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: {
                      type: 'string',
                      example: 'Registration initiated. Verification OTP has been sent to your email.',
                    },
                    data: {
                      type: 'object',
                      properties: {
                        email: { type: 'string', example: 'masheinrich@gmail.com' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Validation failed or email already registered.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                examples: {
                  ValidationError: {
                    summary: 'Password complexity or field validation failure',
                    value: {
                      success: false,
                      message: 'Validation error',
                      errors: [
                        {
                          code: 'invalid_string',
                          message: 'Password must contain at least one uppercase letter',
                          path: ['password'],
                        },
                      ],
                    },
                  },
                  EmailAlreadyRegisteredUser: {
                    summary: 'Email already registered as participant',
                    value: {
                      success: false,
                      message: 'Email is already registered as user',
                    },
                  },
                  EmailAlreadyRegisteredStaff: {
                    summary: 'Email already registered as staff/committee',
                    value: {
                      success: false,
                      message: 'Email is already registered as staff',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/verify-otp': {
      post: {
        tags: ['Auth - Registration Flow'],
        summary: 'Verify OTP - Account Registration',
        description: 'Verifies the 6-digit OTP sent after registration. On success, creates the final active User in the database via atomic transaction, sets an HTTP-Only authentication cookie, and returns the user object with JWT token.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OtpInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'Registration verification successful. Account is activated and session token returned.',
            headers: {
              'Set-Cookie': {
                schema: {
                  type: 'string',
                  example: 'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; Path=/; HttpOnly; SameSite=Lax',
                },
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: {
                      type: 'string',
                      example: 'Verification successful. Account is now active.',
                    },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'integer', example: 1 },
                            name: { type: 'string', example: 'John Doe' },
                            email: { type: 'string', example: 'masheinrich@gmail.com' },
                            role: { type: 'string', example: 'USER' },
                          },
                        },
                        token: {
                          type: 'string',
                          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Invalid OTP, expired OTP, or verification record not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                examples: {
                  DataNotFoundOrExpired: {
                    summary: 'Verification data not found or expired',
                    value: {
                      success: false,
                      message: 'Verification data for this email was not found or has expired',
                    },
                  },
                  OtpExpired: {
                    summary: 'OTP exceeded 5-minute lifespan',
                    value: {
                      success: false,
                      message: 'OTP has expired. Please request a new one',
                    },
                  },
                  InvalidOtpAttemptsLeft: {
                    summary: 'Wrong OTP entered (attempts remaining)',
                    value: {
                      success: false,
                      message: 'Invalid OTP. Attempts left: 2',
                    },
                  },
                  MaxAttemptsExceeded: {
                    summary: 'Wrong OTP entered 3 times (data deleted)',
                    value: {
                      success: false,
                      message: 'Invalid OTP entered 3 times. Verification data deleted. Please register again.',
                    },
                  },
                  ValidationError: {
                    summary: 'Request format validation failure',
                    value: {
                      success: false,
                      message: 'Validation error',
                      errors: [
                        {
                          code: 'too_small',
                          message: 'OTP must be 6 digits',
                          path: ['otp'],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/resend-otp': {
      post: {
        tags: ['Auth - Registration Flow'],
        summary: 'Resend OTP verification code',
        description: 'Generates a fresh 6-digit OTP and sends it to the user email. Resets try counter to 0.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ResendOtpInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'OTP successfully resent.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: {
                      type: 'string',
                      example: 'A new OTP has been sent to your email.',
                    },
                    data: { type: 'object', nullable: true, example: null },
                  },
                },
              },
            },
          },
          400: {
            description: 'No active verification process or invalid email.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                examples: {
                  NoActiveVerification: {
                    summary: 'No active verification process found',
                    value: {
                      success: false,
                      message: 'No active verification process for this email',
                    },
                  },
                  ValidationError: {
                    summary: 'Invalid email address provided',
                    value: {
                      success: false,
                      message: 'Validation error',
                      errors: [
                        {
                          code: 'invalid_format',
                          message: 'Invalid email address',
                          path: ['email'],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        tags: ['Auth - Password Reset Flow'],
        summary: 'Request password reset OTP',
        description: 'Sends a 6-digit OTP code to the registered user email address for resetting a forgotten password.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ForgotPasswordInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'Password reset OTP sent successfully.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: {
                      type: 'string',
                      example: 'Password reset OTP has been sent to your email.',
                    },
                    data: { type: 'object', nullable: true, example: null },
                  },
                },
              },
            },
          },
          400: {
            description: 'Email not found or validation error.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                examples: {
                  EmailNotFound: {
                    summary: 'User with provided email does not exist',
                    value: {
                      success: false,
                      message: 'Email not found',
                    },
                  },
                  ValidationError: {
                    summary: 'Invalid email format',
                    value: {
                      success: false,
                      message: 'Validation error',
                      errors: [
                        {
                          code: 'invalid_format',
                          message: 'Invalid email address',
                          path: ['email'],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/verify-otp?flow=password-reset': {
      post: {
        tags: ['Auth - Password Reset Flow'],
        summary: 'Verify OTP - Password Reset',
        description: 'Verifies the 6-digit OTP requested via `/api/auth/forgot-password`. Payload is simply `{ email, otp }`. On success, returns the single-use `resetToken` required to execute `/api/auth/reset-password`.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OtpInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'OTP verified successfully for password reset. Returns `resetToken`.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: {
                      type: 'string',
                      example: 'OTP verified successfully. Please enter your new password using the reset token.',
                    },
                    data: {
                      type: 'object',
                      properties: {
                        resetToken: {
                          type: 'string',
                          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6Im1hc2RhZW5nMjk0QGdtYWlsLmNvbSIsInB1cnBvc2UiOiJyZXNldF9wYXNzd29yZCJ9...',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Invalid OTP, expired OTP, or verification record not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                examples: {
                  DataNotFoundOrExpired: {
                    summary: 'Verification data not found or expired',
                    value: {
                      success: false,
                      message: 'Verification data for this email was not found or has expired',
                    },
                  },
                  OtpExpired: {
                    summary: 'OTP exceeded 5-minute lifespan',
                    value: {
                      success: false,
                      message: 'OTP has expired. Please request a new one',
                    },
                  },
                  InvalidOtpAttemptsLeft: {
                    summary: 'Wrong OTP entered (attempts remaining)',
                    value: {
                      success: false,
                      message: 'Invalid OTP. Attempts left: 2',
                    },
                  },
                  MaxAttemptsExceeded: {
                    summary: 'Wrong OTP entered 3 times (data deleted)',
                    value: {
                      success: false,
                      message: 'Invalid OTP entered 3 times. Verification data deleted. Please register again.',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/reset-password': {
      post: {
        tags: ['Auth - Password Reset Flow'],
        summary: 'Reset password using verified reset token',
        description: 'Sets a new password for the user. Requires the valid `resetToken` (obtained from `/api/auth/verify-otp`) provided in the Authorization header (`Bearer <resetToken>`), query parameter `?token=`, or request body `token`.',
        parameters: [
          {
            name: 'token',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Reset token if not passed in Authorization header or body',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ResetPasswordInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'Password reset successfully.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: {
                      type: 'string',
                      example: 'Password updated successfully. Please login with your new password.',
                    },
                    data: { type: 'object', nullable: true, example: null },
                  },
                },
              },
            },
          },
          400: {
            description: 'Validation failed or user not found.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                examples: {
                  PasswordComplexityError: {
                    summary: 'Password does not meet required criteria',
                    value: {
                      success: false,
                      message: 'Validation error',
                      errors: [
                        {
                          code: 'invalid_string',
                          message: 'Password must contain at least one special character',
                          path: ['password'],
                        },
                      ],
                    },
                  },
                  UserNotFound: {
                    summary: 'Target user not found in database',
                    value: {
                      success: false,
                      message: 'User not found',
                    },
                  },
                },
              },
            },
          },
          401: {
            description: 'Reset token missing, invalid, or expired.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                examples: {
                  ResetTokenMissing: {
                    summary: 'No reset token provided in headers or body',
                    value: {
                      success: false,
                      message: 'Reset token not found. Please verify OTP first.',
                    },
                  },
                  ResetTokenInvalidOrExpired: {
                    summary: 'Reset token expired or signature invalid',
                    value: {
                      success: false,
                      message: 'Reset token is invalid or has expired.',
                    },
                  },
                  InvalidTokenPurpose: {
                    summary: 'Token passed is not a reset_password token',
                    value: {
                      success: false,
                      message: 'Invalid token purpose for password reset.',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth - Session Management'],
        summary: 'Login as regular participant',
        description: 'Authenticates a regular user with email and password. Sets an HTTP-Only cookie `token` and returns user profile with JWT.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'User login successful. Cookie `token` set.',
            headers: {
              'Set-Cookie': {
                schema: {
                  type: 'string',
                  example: 'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; Path=/; HttpOnly; SameSite=Lax',
                },
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'User login successful.' },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'integer', example: 1 },
                            name: { type: 'string', example: 'John Doe' },
                            email: { type: 'string', example: 'user@sxcintersummit.com' },
                            role: { type: 'string', example: 'USER' },
                          },
                        },
                        token: {
                          type: 'string',
                          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Validation failed.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiValidationErrorResponse' },
                examples: {
                  ValidationError: {
                    summary: 'Email format or password missing',
                    value: {
                      success: false,
                      message: 'Validation error',
                      errors: [
                        {
                          code: 'invalid_format',
                          message: 'Invalid email address',
                          path: ['email'],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          401: {
            description: 'Authentication failure (invalid credentials or email unregistered).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                examples: {
                  InvalidCredentials: {
                    summary: 'Password does not match',
                    value: {
                      success: false,
                      message: 'Invalid credentials',
                    },
                  },
                  EmailNotRegistered: {
                    summary: 'Email is not registered as a participant',
                    value: {
                      success: false,
                      message: 'Email is not registered as user',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/admin/login': {
      post: {
        tags: ['Auth - Session Management'],
        summary: 'Login as staff / administrator',
        description: 'Authenticates a staff or admin account. Sets an HTTP-Only cookie `token` and returns staff details with division info and JWT.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginInput' },
            },
          },
        },
        responses: {
          200: {
            description: 'Staff login successful. Cookie `token` set.',
            headers: {
              'Set-Cookie': {
                schema: {
                  type: 'string',
                  example: 'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; Path=/; HttpOnly; SameSite=Lax',
                },
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Staff login successful.' },
                    data: {
                      type: 'object',
                      properties: {
                        staff: {
                          type: 'object',
                          properties: {
                            id: { type: 'integer', example: 1 },
                            name: { type: 'string', example: 'Admin SxC' },
                            email: { type: 'string', example: 'admin@sxcintersummit.com' },
                            role: { type: 'string', example: 'ADMIN' },
                            division: { type: 'string', example: 'IT' },
                          },
                        },
                        token: {
                          type: 'string',
                          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Validation failed.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiValidationErrorResponse' },
                examples: {
                  ValidationError: {
                    summary: 'Validation error',
                    value: {
                      success: false,
                      message: 'Validation error',
                      errors: [
                        {
                          code: 'invalid_type',
                          message: 'Required',
                          path: ['email'],
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          401: {
            description: 'Authentication failure (invalid credentials or email unregistered as staff).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                examples: {
                  InvalidCredentials: {
                    summary: 'Password does not match',
                    value: {
                      success: false,
                      message: 'Invalid credentials',
                    },
                  },
                  EmailNotRegistered: {
                    summary: 'Email is not registered as staff/committee',
                    value: {
                      success: false,
                      message: 'Email is not registered as staff',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth - Session Management'],
        summary: 'Logout and terminate active session',
        description: 'Requires authentication via Bearer token or Cookie. Adds the current token to the database blacklist table and clears the session cookie.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          200: {
            description: 'Logout successful. Session cookie cleared and token blacklisted.',
            headers: {
              'Set-Cookie': {
                schema: {
                  type: 'string',
                  example: 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly',
                },
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Logout successful. Session cleared.' },
                    data: { type: 'object', nullable: true, example: null },
                  },
                },
              },
            },
          },
          401: {
            description: 'Unauthorized access (missing token, revoked token, or expired token).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                examples: {
                  NoTokenProvided: {
                    summary: 'Missing authentication token',
                    value: {
                      success: false,
                      message: 'Unauthorized, no token provided',
                    },
                  },
                  TokenRevoked: {
                    summary: 'Token has already been blacklisted / logged out',
                    value: {
                      success: false,
                      message: 'Token has been revoked',
                    },
                  },
                  InvalidOrExpiredToken: {
                    summary: 'Token signature invalid or expired naturally',
                    value: {
                      success: false,
                      message: 'Invalid or expired token',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth - Session Management'],
        summary: 'Get current authenticated user profile',
        description: 'Returns the decoded JWT session payload for the currently authenticated user or staff member.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          200: {
            description: 'Current user profile data.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Current user profile data.' },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'integer', example: 1 },
                            email: { type: 'string', example: 'user@sxcintersummit.com' },
                            name: { type: 'string', example: 'John Doe' },
                            role: { type: 'string', example: 'USER' },
                            accountType: { type: 'string', example: 'user' },
                            divisionId: { type: 'integer', nullable: true, example: 1 },
                            divisionName: { type: 'string', nullable: true, example: 'IT' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: {
            description: 'Unauthorized access (missing token, revoked token, or expired token).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                examples: {
                  NoTokenProvided: {
                    summary: 'Missing authentication token',
                    value: {
                      success: false,
                      message: 'Unauthorized, no token provided',
                    },
                  },
                  TokenRevoked: {
                    summary: 'Token has already been blacklisted / logged out',
                    value: {
                      success: false,
                      message: 'Token has been revoked',
                    },
                  },
                  InvalidOrExpiredToken: {
                    summary: 'Token signature invalid or expired naturally',
                    value: {
                      success: false,
                      message: 'Invalid or expired token',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/google': {
      get: {
        tags: ['Auth - Google OAuth'],
        summary: 'Initiate Google OAuth Flow',
        description: 'Redirects the user to Google OAuth consent page, or returns the authorization URL if requested with `?json=true` or `Accept: application/json`.',
        parameters: [
          {
            name: 'state',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Optional state string or client redirect URI to preserve across OAuth handshake',
          },
          {
            name: 'json',
            in: 'query',
            required: false,
            schema: { type: 'boolean' },
            description: 'Set to true to receive the Google consent URL as a JSON response instead of a 302 redirect',
          },
        ],
        responses: {
          200: {
            description: 'Google OAuth authorization URL successfully generated.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Google OAuth authorization URL generated.' },
                    data: {
                      type: 'object',
                      properties: {
                        url: { type: 'string', example: 'https://accounts.google.com/o/oauth2/v2/auth?...' },
                      },
                    },
                  },
                },
              },
            },
          },
          302: {
            description: 'Direct redirect to Google OAuth login screen.',
          },
        },
      },
    },
    '/api/auth/google/callback': {
      get: {
        tags: ['Auth - Google OAuth'],
        summary: 'Google OAuth Callback Handler',
        description: 'Endpoint invoked by Google redirect with authorization code. Exchanges code for user info, activates user session, and issues session cookie.',
        parameters: [
          {
            name: 'code',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Authorization code provided by Google OAuth',
          },
          {
            name: 'state',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Optional redirect URL or state',
          },
        ],
        responses: {
          200: {
            description: 'Authentication successful. User session established.',
          },
          302: {
            description: 'Redirect to state URL if an HTTP redirect URL was provided.',
          },
          401: {
            description: 'Google code exchange failed or unauthorized.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
              },
            },
          },
        },
      },
    },
  },
}

export const swaggerUiOptions = {
  customSiteTitle: 'SxC International Summit 2026 API Docs',
  customCss: `
    /* Response 2xx Success (Green) */
    .swagger-ui .responses-table tr.response[data-code^="2"] {
      background: rgba(16, 185, 129, 0.08) !important;
      border-left: 5px solid #10b981 !important;
    }
    .swagger-ui .responses-table tr.response[data-code^="2"] .response-col_status {
      color: #10b981 !important;
      font-weight: 700 !important;
    }
    .swagger-ui .responses-table tr.response[data-code^="2"] .response-col_status::before {
      content: "● ";
      color: #10b981;
    }
    .swagger-ui .response[data-code^="2"] .highlight-code,
    .swagger-ui .response[data-code^="2"] pre.microlight {
      background: #0d281e !important;
      border: 1px solid rgba(16, 185, 129, 0.4) !important;
      border-radius: 6px !important;
    }

    /* Response 3xx Redirects (Yellow / Amber) */
    .swagger-ui .responses-table tr.response[data-code^="3"] {
      background: rgba(245, 158, 11, 0.12) !important;
      border-left: 5px solid #f59e0b !important;
    }
    .swagger-ui .responses-table tr.response[data-code^="3"] .response-col_status {
      color: #f59e0b !important;
      font-weight: 700 !important;
    }
    .swagger-ui .responses-table tr.response[data-code^="3"] .response-col_status::before {
      content: "● ";
      color: #f59e0b;
    }
    .swagger-ui .response[data-code^="3"] .highlight-code,
    .swagger-ui .response[data-code^="3"] pre.microlight {
      background: #271c0c !important;
      border: 1px solid rgba(245, 158, 11, 0.4) !important;
      border-radius: 6px !important;
    }
    .swagger-ui .response[data-code^="3"] pre.microlight code {
      color: #fde68a !important;
    }


    /* Response 4xx & 5xx Errors (Red) */
    .swagger-ui .responses-table tr.response[data-code^="4"],
    .swagger-ui .responses-table tr.response[data-code^="5"] {
      background: rgba(239, 68, 68, 0.14) !important;
      border-left: 5px solid #ef4444 !important;
    }
    .swagger-ui .responses-table tr.response[data-code^="4"] .response-col_status,
    .swagger-ui .responses-table tr.response[data-code^="5"] .response-col_status {
      color: #ef4444 !important;
      font-weight: 700 !important;
    }
    .swagger-ui .responses-table tr.response[data-code^="4"] .response-col_status::before,
    .swagger-ui .responses-table tr.response[data-code^="5"] .response-col_status::before {
      content: "● ";
      color: #ef4444;
    }
    .swagger-ui .response[data-code^="4"] .highlight-code,
    .swagger-ui .response[data-code^="5"] .highlight-code,
    .swagger-ui .response[data-code^="4"] pre.microlight,
    .swagger-ui .response[data-code^="5"] pre.microlight {
      background: #2a1114 !important;
      border: 1.5px solid rgba(239, 68, 68, 0.7) !important;
      border-radius: 6px !important;
    }
    .swagger-ui .response[data-code^="4"] pre.microlight code,
    .swagger-ui .response[data-code^="5"] pre.microlight code {
      color: #fecaca !important;
    }
  `,
}

