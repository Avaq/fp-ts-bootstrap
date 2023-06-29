import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';

import {withServices} from './services';

const program = withServices(({server, logger}) => pipe(
  TE.fromIO(logger.info(`Server listening on ${JSON.stringify(server.address())}`)),
  TE.apSecond(TE.fromTask(() => new Promise(resolve => {
    process.once('SIGINT', resolve);
  }))),
  TE.chain(() => TE.fromIO(logger.info('Shutting down app'))),
));

program().then(E.fold(console.error, console.log), console.error);
