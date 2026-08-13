export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

type RequiredEnvOptions = {
  minLength?: number;
  trim?: boolean;
};

export function getRequiredEnv(name: string, options: RequiredEnvOptions = {}) {
  const rawValue = process.env[name];
  const minLength = options.minLength ?? 1;

  if (!rawValue || rawValue.trim().length === 0) {
    throw new AuthConfigurationError(`${name} is required.`);
  }

  const value = options.trim === false ? rawValue : rawValue.trim();

  if (value.length < minLength) {
    throw new AuthConfigurationError(`${name} must contain at least ${minLength} characters.`);
  }

  return value;
}

export const authSecret = getRequiredEnv("NEXTAUTH_SECRET", {
  minLength: 32,
});
