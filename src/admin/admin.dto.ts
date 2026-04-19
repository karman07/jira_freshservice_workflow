import { IsEmail, IsString, MinLength } from 'class-validator';

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
  freshserviceBaseUrl?: string;
  freshserviceApiKey?: string;
  fsCustomStatusAwaiting?: string;
  fallbackEmail?: string;
  description?: string;
}

export class UpdateCustomerDto {
  name?: string;
  jiraBaseUrl?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
  jiraProjectKey?: string;
  freshserviceBaseUrl?: string;
  freshserviceApiKey?: string;
  fsCustomStatusAwaiting?: string;
  fallbackEmail?: string;
  description?: string;
  isActive?: boolean;
}
