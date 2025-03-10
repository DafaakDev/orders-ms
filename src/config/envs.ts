import 'dotenv/config';
import * as joi from 'joi';
import * as process from 'node:process';

interface EnvVars {
  PORT: number;
  DATABASE_URL: string;
  NATS_SERVER: string;
}

const envsSchema = joi
  .object({
    PORT: joi.number().required(),
    DATABASE_URL: joi.string().required(),
    NATS_SERVER: joi.string().required(),
  })
  .unknown(true);

const { error, value } = envsSchema.validate(process.env);

if (error) throw new Error(`Config validation Error: ${error.message}`);

const envVars: EnvVars = value;

export const envs = {
  port: envVars.PORT,
  databaseUrl: envVars.DATABASE_URL,
  natsServer: envVars.NATS_SERVER,
};
