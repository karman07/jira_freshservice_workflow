import { IsEmail, IsString, MinLength, IsOptional, IsBoolean } from 'class-validator';

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
}

export class CreateCustomerDto {
  @IsString() name: string;
  @IsString() slug: string;
  @IsString() jiraBaseUrl: string;
  @IsString() jiraEmail: string;
  @IsString() jiraApiToken: string;
  @IsString() jiraProjectKey: string;

  // Freshservice Instance A (optional — uses global env defaults)
  freshserviceBaseUrl?: string;
  freshserviceApiKey?: string;
  fsCustomStatusAwaiting?: string;
  fallbackEmail?: string;

  // Freshservice Instance B — FS↔FS pairing
  @IsOptional() fsPairEnabled?: boolean;
  @IsOptional() fs2BaseUrl?: string;
  @IsOptional() fs2ApiKey?: string;
  @IsOptional() fs2FallbackEmail?: string;

  description?: string;
}

export class UpdateCustomerDto {
  name?: string;
  jiraBaseUrl?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
  jiraProjectKey?: string;

  // Freshservice Instance A
  freshserviceBaseUrl?: string;
  freshserviceApiKey?: string;
  fsCustomStatusAwaiting?: string;
  fallbackEmail?: string;

  // Freshservice Instance B
  @IsOptional() fsPairEnabled?: boolean;
  @IsOptional() fs2BaseUrl?: string;
  @IsOptional() fs2ApiKey?: string;
  @IsOptional() fs2FallbackEmail?: string;

  description?: string;
  isActive?: boolean;
}
