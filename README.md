# FP-TS Bootstrap

This is a module aimed at application bootstrapping using types from [fp-ts][].
Its ideas and most of the code were ported from the [fluture-hooks][] library.
You can read more about the approach in [application bootstrapping with fp-ts][].

This module mainly provides a [`Bracket` type](#bracket) with accompanying type
class instances. This solves the problem stipulated at the end of
*application bootstrapping with fp-ts* by threading the return type.

Besides the `Bracket` type, this module also provides a
[`Service` type](#service) which is a small layer on top for managing
dependencies through the `Reader` monad.

[fp-ts]: https://gcanti.github.io/fp-ts/
[fluture-hooks]: https://github.com/fluture-js/fluture-hooks
[application bootstrapping with fp-ts]: https://dev.to/avaq/application-bootstrapping-with-fp-ts-59b5

## Example

Define your service. See the full example in
[`./example/services/server.ts`](./example/services/server.ts).

```ts
export const withServer: Service.Service<Error, Dependencies, HTTP.Server> = (
  ({port, app}) => Bracket.bracket(
    () => new Promise(resolve => {
      const server = HTTP.createServer(app);
      server.listen(port, () => resolve(E.right(server)));
    }),
    server => () => new Promise(resolve => {
      server.close((e: unknown) => resolve(
        e instanceof Error ? E.left(e) : E.right(undefined)
      ));
    }),
  )
);
```

Combine multiple such services with ease using Do notation. See the full example
in [`./example/services/index.ts`](./example/services/index.ts).

```ts
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
```

Consume your service. See the full example in [`./example/index.ts`](./example/index.ts).

```ts
const program = withServices(({server, logger}) => pipe(
  TE.fromIO(logger.info(`Server listening on ${JSON.stringify(server.address())}`)),
  TE.apSecond(TE.fromTask(() => new Promise(resolve => {
    process.once('SIGINT', resolve);
  }))),
  TE.chain(() => TE.fromIO(logger.info('Shutting down app'))),
));
```

And finally, run your program:

```ts
program().then(E.fold(console.error, console.log), console.error);
```

## Types

### Bracket

```ts
import * as Bracket from 'fp-ts-bootstrap/Bracket';
```

```ts
type Bracket<E, R> = (
  <T>(consume: (resource: R) => TaskEither<E, T>) => TaskEither<E, T>
);
```

The `Bracket` type aliases the structure that's encountered when using a curried
variant of [fp-ts' `TaskEither.bracket` function][]. This curried variant is
also exported from the Bracket module as `bracket`. It models a bracketed
resource for which the consumption hasn't been specified yet.

[fp-ts' `TaskEither.bracket` function]: https://gcanti.github.io/fp-ts/modules/TaskEither.ts.html#bracket

The Bracket module defines various type class instances for `Bracket` that allow
you to compose and combine multiple bracketed resources. From most instances,
some derivative functions are exported as well.

- Pointed: `of`, `Do`
- Functor: `map`, `flap`, `bindTo`, `let`
- Apply: `ap`, `apFirst`, `apSecond`, `apS`, `getApplySemigroup`, `sequenceT`, `sequenceS`
- Applicative: Pointed Apply
- Chain: `chain`, `chainFirst`, `bind`
- Monad: Pointed Chain
- ApplyPar: `apPar`, `apFirstPar`, `apSecondPar`, `apSPar`, `getApplySemigroupPar`, `sequenceTPar`, `sequenceSPar`
- ApplicativePar: Pointed ApplyPar

### Service

```ts
import * as Service from 'fp-ts-bootstrap/Service';
```

```ts
type Service<E, D, S> = Reader<D, Bracket<E, S>>;
```

The `Service` type is a small layer on top of `Reader` that formalizes the
type of a Bracket with dependencies. The Service type can also be composed and
combined using the utilities provided by `ReaderT<Bracket>`. These utilities
are re-exported from the Service module.

## Cookbook

### Defining a service with acquisition and disposal

```ts
import * as FS from 'fs/promises';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import * as Bracket from 'fp-ts-bootstrap/Bracket';

const acquireFileHandle = (url: string) => (
  TE.tryCatch(() => FS.open(url, 'a'), E.toError)
);

const disposeFileHandle = (file: FS.FileHandle) => (
  TE.tryCatch(() => file.close(), E.toError)
);

const withMyFile = Bracket.bracket(
  acquireFileHandle('/tmp/my-file.txt'),
  disposeFileHandle,
);
```

### Defining a service with dependencies

This recipe builds on the previous one by adding dependencies to the service.

```ts
import {Service} from 'fp-ts-bootstrap/Service';

type Dependencies = {
  url: string;
};

const withMyFile: Service<Error, Dependencies, FS.FileHandle> = (
  ({url}) => Bracket.bracket(
    acquireFileHandle(url),
    disposeFileHandle,
  )
);
```

### Combining services in parallel

The `Bracket` type has a sequential `Applicative` instance that it uses by
default, but there's also a parallel `ApplicativePar` instance that you can use
to combine services in parallel.\* Two very useful derivative function using
`ApplicativePar` are

- `sequenceSPar` for building a Struct of resources from a Struct of Brackets; and
- `apSPar` for adding another property to an existing Struct of services:

```ts
import {pipe} from 'fp-ts/function';
import * as Bracket from 'fp-ts-bootstrap/Bracket';

const withServices = pipe(
  Bracket.sequenceSPar({
    env: withEnv,
    logger: withLogger({level: 'info'}),
  }),
  Bracket.apSPar('database', withDatabase({url: 'postgres://localhost:5432'}))
);

const program = withServices(({env, logger, database}) => pipe(
  // ...
));
```

\* By "in parallel" we mean that the services are *acquired* in parallel, but
disposed in sequence. This is a technical limitation that exists to ensure that
the `ApplyPar` instance is lawful.

### Threading dependencies during service composition

```ts
import {pipe} from 'fp-ts/function';
import * as Bracket from 'fp-ts-bootstrap/Bracket';

const withServices = pipe(
  withEnv,
  Bracket.bindTo('env'),
  Bracket.bind('logger', ({env}) => withLogger({level: env.LOG_LEVEL})),
  Bracket.bind('database', ({env, logger}) => withDatabase({
    url: env.DATABASE_URL,
    logger: logger
  })),
  Bracket.bind('server', ({env, database}) => withServer({
    port: env.PORT,
    app: app,
    database: database,
  })),
);
```
