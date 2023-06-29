import {pipe} from 'fp-ts/function';
import * as Bracket from '../../src/Bracket';

import {withEnv} from './env';
import {withServer} from './server';
import {withDatabase} from './database';
import {withLogger} from './logger';
import {withApp} from './app';

export const withServices = pipe(
  withEnv,
  Bracket.bindTo('env'),
  Bracket.bind('logger', ({env}) => withLogger({level: env.LOG_LEVEL})),
  Bracket.bind('database', ({env, logger}) => withDatabase({
    url: env.DATABASE_URL,
    logger: logger
  })),
  Bracket.bind('app', ({database}) => withApp({database})),
  Bracket.bind('server', ({env, app}) => withServer({
    port: env.PORT,
    app: app,
  })),
);
