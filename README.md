# FP-TS Bootstrap

> Service orchestration made functional

An application bootstrapping framework around Monadic composition of application
services. Based on types from [fp-ts][] with ideas that were tried and tested
with the [fluture-hooks][] library.

## Features

- 🧑‍🤝‍🧑 A "service" is a combination of its acquisition and disposal logic
- 🚦 Easy management of asynchronously acquired services
- 🛬 Resources are disposed gracefully after consumption
- 🪂 Resources are disposed even if the consumption program crashes
- 🔀 Automatic sequencing of acquisition and disposal of dependent services
- 🛣️ Faster app startup times with parallel acquisition of independent services
- 🏗 Use the Monadic API to compose larger services out of multiple smaller ones
- 🧃 Monads all the way down! Learn more in [this article about the approach][]

[fp-ts]: https://gcanti.github.io/fp-ts/
[fluture-hooks]: https://github.com/fluture-js/fluture-hooks
[this article about the approach]: https://dev.to/avaq/application-bootstrapping-with-fp-ts-59b5

## Example

We start with a service definition. It consists of an acquisition function,
a disposal function, bundled with the `bracket` utility.

See the full example in [`./example/services/server.ts`](./example/services/server.ts).

```ts
export const withServer: Service.Service<Error, Dependencies, HTTP.Server> = (
  ({port, app}) => Bracket.bracket(
    // Acquire:
    () => new Promise(resolve => {
      const server = HTTP.createServer(app);
      server.listen(port, () => resolve(E.right(server)));
    }),

    // Dispose:
    server => () => new Promise(resolve => {
      server.close((e: unknown) => resolve(
        e instanceof Error ? E.left(e) : E.right(undefined)
      ));
    }),
  )
);
```

Multiple services can be combined in a host of different ways to form larger
services. One powerful way to do so is with Do notation. See the full example
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

A service is really just a function that takes a callback: The program that
"consumes" the service. Consumption of `withServer` is as easy as
`withServer(server => ...)` and `withServices` is just
`withServices(({server, logger}) => ...)`.

So let's consume the `withServices` service.

See the full example in [`./example/index.ts`](./example/index.ts).

```ts
const program = withServices(({server, logger}) => pipe(
  TE.fromIO(logger.info(`Server listening on ${JSON.stringify(server.address())}`)),
  TE.apSecond(TE.fromTask(() => new Promise(resolve => {
    process.once('SIGINT', resolve);
  }))),
  TE.chain(() => TE.fromIO(logger.info('Shutting down app'))),
));
```

The consumption of a service returns an [fp-ts `TaskEither`][], which can itself
be monadically composed with other Tasks, or eventually consumed. This too is
just a function that returns a Promise:

```ts
program().then(E.fold(console.error, console.log), console.error);
```

[fp-ts `TaskEither`]: https://gcanti.github.io/fp-ts/modules/TaskEither.ts.html

## Types

### Bracket

```ts
import {Bracket} from 'fp-ts-bootstrap';
```

```ts
type Bracket<E, R> = (
  <T>(consume: (resource: R) => TaskEither<E, T>) => TaskEither<E, T>
);
```

The Bracket type is a drop-in replacement for the Cont type from [fp-ts-cont][],
but specialized in returning `TaskEither`. This solves the problem stipulated at
the end of [application bootstrapping with fp-ts][] by allowing the return type
to be threaded through the program. Furthermore, it makes the `ApplicativePar`
instance possible, which allows for parallel composition of bracketed resources.

The Bracket type aliases the structure that's encountered when using a curried
variant of [fp-ts' `TaskEither.bracket` function][]. This curried variant is
also exported from the Bracket module as `bracket`. It models a bracketed
resource for which the consumption hasn't been specified yet.

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

[fp-ts' `TaskEither.bracket` function]: https://gcanti.github.io/fp-ts/modules/TaskEither.ts.html#bracket
[fp-ts-cont]: https://github.com/joshburgess/fp-ts-cont
[application bootstrapping with fp-ts]: https://dev.to/avaq/application-bootstrapping-with-fp-ts-59b5

### Service

```ts
import {Service} from 'fp-ts-bootstrap';
```

```ts
type Service<E, D, S> = Reader<D, Bracket<E, S>>;
```

The Service type is a small layer on top of Reader that formalizes the
type of a Bracket with dependencies. The Service type can also be composed and
combined using the utilities provided by `ReaderT<Bracket>`. These utilities
are re-exported from [the Service module](./src/Service.ts).

## Cookbook

### Defining a service with acquisition and disposal

```ts
import * as FS from 'fs/promises';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import {Bracket} from 'fp-ts-bootstrap';

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
import {Service} from 'fp-ts-bootstrap/lib/Service';

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

The Bracket type has a sequential `Applicative` instance that it uses by
default, but there's also a parallel `ApplicativePar` instance that you can use
to combine services in parallel\*. Two very useful derivative function using
`ApplicativePar` are

- `sequenceSPar` for building a Struct of resources from a Struct of Brackets; and
- `apSPar` for adding another property to an existing Struct of services:

```ts
import {pipe} from 'fp-ts/function';
import {Bracket} from 'fp-ts-bootstrap';

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
import {Bracket} from 'fp-ts-bootstrap';

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

### Creating a full-fledged program by composing services

There's a fully working example app in the [`./example`](./example) directory.
To run it, clone this repo and run the following commands:

```console
$ npm install
$ ./node_modules/.bin/ts-node ./example/index.ts
```

You should now be able to visit http://localhost:3000/arbitrary/path,
which should give you a Hello World response, and log your request URL
to `./database.txt`.
