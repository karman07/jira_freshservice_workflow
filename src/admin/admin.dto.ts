import { IsEmail, IsString, MinLength, IsOptional, IsBoolean, IsNumberString } from 'class-validator';

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
  @IsOptional() @IsString() freshserviceBaseUrl?: string;
  @IsOptional() @IsString() freshserviceApiKey?: string;
  @IsOptional() @IsString() fsCustomStatusAwaiting?: string;
  @IsOptional() @IsString() fallbackEmail?: string;

  // Freshservice Instance B — FS↔FS pairing
  @IsOptional() @IsBoolean() fsPairEnabled?: boolean;
  @IsOptional() @IsString() fs2BaseUrl?: string;
  @IsOptional() @IsString() fs2ApiKey?: string;
  @IsOptional() @IsString() fs2FallbackEmail?: string;

  @IsOptional() @IsString() description?: string;

  // Shared FS Dispatcher routing keys
  @IsOptional() @IsString() freshserviceCompanyId?: string;
  @IsOptional() @IsString() freshserviceGroupId?: string;
  @IsOptional() @IsString() freshserviceRoutingTag?: string;

  // Subject-based routing key (highest priority)
  @IsOptional() @IsString() freshserviceCustomerId?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() jiraBaseUrl?: string;
  @IsOptional() @IsString() jiraEmail?: string;
  @IsOptional() @IsString() jiraApiToken?: string;
  @IsOptional() @IsString() jiraProjectKey?: string;

  // Freshservice Instance A
  @IsOptional() @IsString() freshserviceBaseUrl?: string;
  @IsOptional() @IsString() freshserviceApiKey?: string;
  @IsOptional() @IsString() fsCustomStatusAwaiting?: string;
  @IsOptional() @IsString() fallbackEmail?: string;

  // Freshservice Instance B
  @IsOptional() @IsBoolean() fsPairEnabled?: boolean;
  @IsOptional() @IsString() fs2BaseUrl?: string;
  @IsOptional() @IsString() fs2ApiKey?: string;
  @IsOptional() @IsString() fs2FallbackEmail?: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;

  // Shared FS Dispatcher routing keys
  @IsOptional() @IsString() freshserviceCompanyId?: string;
  @IsOptional() @IsString() freshserviceGroupId?: string;
  @IsOptional() @IsString() freshserviceRoutingTag?: string;

  // Subject-based routing key (highest priority)
  @IsOptional() @IsString() freshserviceCustomerId?: string;
}
