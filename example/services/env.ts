import * as TE from 'fp-ts/TaskEither';

import * as Bracket from '../../src/Bracket';

/*\
 *
 * This is the service that provides the environment variables.
 *
 * Its purpose is to demonstrate how to use the Bracket module to create a
 * service that does not depend on any other services, and merely runs some
 * IO for its acquisition, and has no disposal.
 *
\*/

export type Env = {
  PORT: number;
  LOG_LEVEL: string;
  DATABASE_URL: string;
};

export const withEnv: Bracket.Bracket<Error, Env> = Bracket.fromTaskEither(
  TE.fromIO(() => ({
    PORT: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
    DATABASE_URL: process.env.DATABASE_URL ?? './database.txt',
  })),
);
