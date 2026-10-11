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
      name: 'Upload - File Submissions',
      description: 'Upload payment proof (IBCC-06), requirement proof (twibbon/story), and semifinal slide deck (IBCC-09)',
    },
    {
      name: 'Finance - Verification',
      description: 'Admin verification of payment proofs (ADMIN-02) and requirement submissions',
    },
    {
      name: 'Access Code - IBCC',
      description: 'Generate access codes for semifinal (IBCC-07) and semifinal login with Team ID + Access Code (IBCC-08)',
    },
    {
      name: 'Semifinal - Scoring & Results',
      description: 'Semifinal scoring by judges (ADMIN-03), leaderboard, and result publishing with email notifications (IBCC-10)',
    },
    {
      name: 'Config - Application',
      description: 'Application configuration, registration deadline info, and email scheduler trigger',
    },
    {
      name: 'Admin - Competition',
      description: 'Competition management, team dashboard, and preliminary round evaluation (ADMIN-01)',
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
    },    // UPLOAD — File Submissions    '/api/upload/payment': {
      post: {
        tags: ['Upload - File Submissions'],
        summary: 'Upload payment proof (IBCC-06)',
        description: 'Uploads a payment proof image for a team. Accepted formats: JPG, PNG, WebP, GIF (max 5 MB).',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'teamId'],
                properties: {
                  file: { type: 'string', format: 'binary', description: 'Payment proof image file' },
                  teamId: { type: 'integer', example: 1, description: 'Team ID' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Payment proof uploaded successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseSuccess' } } },
          },
          400: { description: 'Missing file or invalid teamId.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          404: { description: 'Team not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
        },
      },
    },
    '/api/upload/requirement': {
      post: {
        tags: ['Upload - File Submissions'],
        summary: 'Upload requirement proof (twibbon / story)',
        description: 'Uploads a twibbon or IG story screenshot as requirement proof. Accepted formats: JPG, PNG, WebP, GIF (max 5 MB).',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'teamId', 'type'],
                properties: {
                  file: { type: 'string', format: 'binary', description: 'Requirement proof image file' },
                  teamId: { type: 'integer', example: 1 },
                  type: { type: 'string', enum: ['twibbon', 'story'], example: 'twibbon' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Requirement proof uploaded successfully.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseSuccess' } } } },
          400: { description: 'Missing file, invalid teamId, or invalid type.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          404: { description: 'Team not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
        },
      },
    },
    '/api/upload/slides': {
      post: {
        tags: ['Upload - File Submissions'],
        summary: 'Upload 5-slide deck (IBCC-09)',
        description: 'Uploads a semifinal presentation deck. Accepted formats: PDF, PPT, PPTX, images (max 20 MB, max 5 slides).',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'teamId'],
                properties: {
                  file: { type: 'string', format: 'binary', description: 'Slide deck file (PDF or PPTX)' },
                  teamId: { type: 'integer', example: 1 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Slide deck uploaded successfully.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseSuccess' } } } },
          400: { description: 'Missing file or invalid teamId.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          404: { description: 'Team not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
        },
      },
    },    // FINANCE — Verification    '/api/finance/verify': {
      post: {
        tags: ['Finance - Verification'],
        summary: 'Verify payment proof (ADMIN-02)',
        description: 'Admin approves or rejects a team\'s payment proof. Triggers status change email notification.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['teamId', 'status'],
                properties: {
                  teamId: { type: 'integer', example: 1 },
                  status: { type: 'string', enum: ['approved', 'rejected'], example: 'approved' },
                  notes: { type: 'string', example: 'Payment amount matches registration fee.', description: 'Optional notes' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Payment verified successfully.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseSuccess' } } } },
          400: { description: 'Validation error.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiValidationErrorResponse' } } } },
          401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          403: { description: 'Forbidden – Admin access required.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          404: { description: 'Team not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
        },
      },
    },
    '/api/finance/requirement/verify': {
      post: {
        tags: ['Finance - Verification'],
        summary: 'Verify requirement submission (twibbon / story)',
        description: 'Admin approves or rejects a team\'s requirement proof (twibbon or IG story). Triggers status change email notification.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['teamId', 'type', 'status'],
                properties: {
                  teamId: { type: 'integer', example: 1 },
                  type: { type: 'string', enum: ['twibbon', 'story'], example: 'twibbon' },
                  status: { type: 'string', enum: ['approved', 'rejected'], example: 'approved' },
                  notes: { type: 'string', example: 'Clear twibbon screenshot verified.' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Requirement verified successfully.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseSuccess' } } } },
          400: { description: 'Validation error.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiValidationErrorResponse' } } } },
          401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          403: { description: 'Forbidden – Admin access required.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          404: { description: 'Team not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
        },
      },
    },    // ACCESS CODE — IBCC    '/api/access-code/generate': {
      post: {
        tags: ['Access Code - IBCC'],
        summary: 'Generate access code for semifinal (IBCC-07)',
        description: 'Admin generates an 8-character alphanumeric access code for a team to use in semifinal login. Previous codes for the team are expired.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['teamId'],
                properties: {
                  teamId: { type: 'integer', example: 1 },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Access code generated successfully.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Access code generated successfully.' },
                    data: {
                      type: 'object',
                      properties: {
                        teamId: { type: 'integer', example: 1 },
                        teamName: { type: 'string', example: 'Team Alpha' },
                        accessCode: { type: 'string', example: 'A1B2C3D4' },
                        expiresAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          403: { description: 'Forbidden – Admin access required.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          404: { description: 'Team not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
        },
      },
    },
    '/api/access-code/login': {
      post: {
        tags: ['Access Code - IBCC'],
        summary: 'Semifinal login with Team ID + Access Code (IBCC-08)',
        description: 'Authenticates a team for the semifinal stage using their team ID and the access code generated by an admin.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['teamId', 'accessCode'],
                properties: {
                  teamId: { type: 'integer', example: 1 },
                  accessCode: { type: 'string', minLength: 8, maxLength: 8, example: 'A1B2C3D4' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Semifinal login successful.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Semifinal login successful.' },
                    data: {
                      type: 'object',
                      properties: {
                        team: {
                          type: 'object',
                          properties: {
                            id: { type: 'integer', example: 1 },
                            name: { type: 'string', example: 'Team Alpha' },
                            status: { type: 'string', example: 'Qualified to Semifinal' },
                            leader: {
                              type: 'object',
                              properties: {
                                id: { type: 'integer', example: 1 },
                                name: { type: 'string', example: 'John Doe' },
                                email: { type: 'string', example: 'john@example.com' },
                              },
                            },
                          },
                        },
                        accessCode: { type: 'string', example: 'A1B2C3D4' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Invalid or expired access code.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                examples: {
                  InvalidCode: { summary: 'Access code invalid or expired', value: { success: false, message: 'Invalid or expired access code.' } },
                },
              },
            },
          },
          404: { description: 'Team not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
        },
      },
    },    // SEMIFINAL — Scoring & Results    '/api/semifinal/score': {
      post: {
        tags: ['Semifinal - Scoring & Results'],
        summary: 'Submit or update a semifinal score (ADMIN-03)',
        description: 'A judge submits a score (0–100) for a team. If the judge already scored this team, the score is updated.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['teamId', 'score'],
                properties: {
                  teamId: { type: 'integer', example: 1 },
                  score: { type: 'number', minimum: 0, maximum: 100, example: 85.5 },
                  comment: { type: 'string', maxLength: 500, example: 'Strong presentation and clear arguments.' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Score submitted successfully.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseSuccess' } } } },
          200: { description: 'Score updated successfully (already scored before).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseSuccess' } } } },
          400: { description: 'Validation error.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiValidationErrorResponse' } } } },
          401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          403: { description: 'Forbidden – Admin access required.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          404: { description: 'Team not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
        },
      },
    },
    '/api/semifinal/scores': {
      get: {
        tags: ['Semifinal - Scoring & Results'],
        summary: 'Get semifinal leaderboard',
        description: 'Returns all semifinal scores grouped by team with average scores, sorted descending.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          200: {
            description: 'Scores retrieved successfully.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Semifinal scores retrieved.' },
                    data: {
                      type: 'object',
                      properties: {
                        rankings: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              teamId: { type: 'integer', example: 1 },
                              teamName: { type: 'string', example: 'Team Alpha' },
                              average: { type: 'number', example: 87.5 },
                              scores: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    judgeId: { type: 'integer', example: 1 },
                                    judgeName: { type: 'string', example: 'Judge A' },
                                    score: { type: 'number', example: 85 },
                                    comment: { type: 'string', nullable: true },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          403: { description: 'Forbidden – Admin access required.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
        },
      },
    },
    '/api/semifinal/publish-results': {
      post: {
        tags: ['Semifinal - Scoring & Results'],
        summary: 'Publish semifinal results & send emails (IBCC-10)',
        description: 'Publishes the semifinal results by marking qualified teams (Top 5) and eliminated teams. Sends congratulatory/elimination emails to all team leaders.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['qualifiedTeamIds'],
                properties: {
                  qualifiedTeamIds: {
                    type: 'array',
                    items: { type: 'integer' },
                    example: [1, 3, 5, 7, 9],
                    description: 'Array of team IDs that qualified to the Final round',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Results published and emails queued.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Results published. 5 teams qualified, 10 teams eliminated. Emails are being sent.' },
                    data: {
                      type: 'object',
                      properties: {
                        qualified: { type: 'array', items: { type: 'integer' }, example: [1, 3, 5, 7, 9] },
                        eliminated: { type: 'array', items: { type: 'integer' }, example: [2, 4, 6, 8, 10] },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Validation error.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiValidationErrorResponse' } } } },
          401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          403: { description: 'Forbidden – Admin access required.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
        },
      },
    },    // CONFIG — Application    '/api/config': {
      get: {
        tags: ['Config - Application'],
        summary: 'Get application configuration',
        description: 'Returns the current registration deadline, extended registration status, and slide upload limits.',
        responses: {
          200: {
            description: 'Configuration retrieved.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Application configuration retrieved.' },
                    data: {
                      type: 'object',
                      properties: {
                        registrationOpen: { type: 'boolean', example: true },
                        deadline: { type: 'string', format: 'date-time', example: '2026-11-15T16:59:59.000Z' },
                        extendedRegistration: { type: 'boolean', example: false },
                        maxSlidePages: { type: 'integer', example: 5 },
                        maxSlideSizeMB: { type: 'integer', example: 20 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/config/reload': {
      post: {
        tags: ['Config - Application'],
        summary: 'Reload application configuration (Admin)',
        description: 'Reloads the application configuration from environment variables. Useful after changing env vars without restarting.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          200: { description: 'Configuration reloaded.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseSuccess' } } } },
          401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          403: { description: 'Forbidden – Admin access required.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
        },
      },
    },
    '/api/config/trigger-emails': {
      post: {
        tags: ['Config - Application'],
        summary: 'Trigger email scheduler manually',
        description: 'Manually triggers the email scheduler to send deadline reminders and payment reminders. Can be used as a webhook endpoint for cronjob.org.',
        responses: {
          200: { description: 'Email scheduler triggered.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseSuccess' } } } },
        },
      },
    },
    // ADMIN — Competition Management
    '/api/admin/competition/teams': {
      get: {
        tags: ['Admin - Competition'],
        summary: 'Get competition teams dashboard',
        description: 'Admin retrieves all competition teams with leader, member details, and current statuses.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          200: {
            description: 'Teams retrieved successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseSuccess' } } },
          },
          401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          403: { description: 'Forbidden – Admin access required.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
        },
      },
    },
    '/api/admin/competition/preliminary/{teamId}': {
      put: {
        tags: ['Admin - Competition'],
        summary: 'Update team preliminary evaluation status (ADMIN-01 & IBCC-05)',
        description: 'Admin evaluates a team in the preliminary round (passed/failed), updates the team score, logs activity, and sends automated email notification to the team leader.',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          {
            name: 'teamId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'The ID of the team to evaluate',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['passed', 'failed'], example: 'passed' },
                  score: { type: 'number', example: 88.5, description: 'Optional preliminary score' },
                  feedback: { type: 'string', example: 'Great paper structure and insight.', description: 'Feedback sent in email if failed' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Preliminary status updated successfully.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponseSuccess' } } } },
          400: { description: 'Validation error.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiValidationErrorResponse' } } } },
          401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          403: { description: 'Forbidden – Admin access required.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
          404: { description: 'Team not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
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

