import * as $Pointed from 'fp-ts/Pointed';
import * as $Functor from 'fp-ts/Functor';
import * as $Apply from 'fp-ts/Apply';
import * as $Applicative from 'fp-ts/Applicative';
import * as $Chain from 'fp-ts/Chain';
import * as $Monad from 'fp-ts/Monad';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import * as O from 'fp-ts/Option';
import {NaturalTransformation22} from 'fp-ts/NaturalTransformation';
import {pipe} from 'fp-ts/function';

export const URI = 'fp-ts-bootstrap/Bracket';
export type URI = typeof URI;

declare module 'fp-ts/HKT' {
  interface URItoKind2<E, A> {
    readonly [URI]: Bracket<E, A>;
  }
}

export type Bracket<E, R> = (
  <T>(consume: (resource: R) => TE.TaskEither<E, T>) => TE.TaskEither<E, T>
);

export type ResourceOf<B extends Bracket<any, any>> = (
  B extends Bracket<any, infer R> ? R : never
);

export const bracket = <E, R>(
  acquire: TE.TaskEither<E, R>,
  dispose: (resource: R) => TE.TaskEither<E, any>
): Bracket<E, R> => consume => TE.bracket(acquire, consume, dispose);

export const Pointed: $Pointed.Pointed2<URI> = {
  URI: URI,
  of: x => use => use(x)
};

export const of = <E = never, T = never>(x: T): Bracket<E, T> => Pointed.of(x);
export const Do = of({});

export const Functor: $Functor.Functor2<URI> = {
  URI: URI,
  map: (fa, f) => use => fa(a => use(f(a))),
};

export const map = <A, B>(f: (a: A) => B) => <E>(fa: Bracket<E, A>) => (
  Functor.map(fa, f)
);

export const flap = $Functor.flap(Functor);
export const bindTo = $Functor.bindTo(Functor);
const let_ = $Functor.let(Functor);
export {let_ as let};

export const Apply: $Apply.Apply2<URI> = {
  ...Functor,
  ap: (fab, fa) => use => fab(ab => fa(a => use(ab(a)))),
};

export const ap = <E, A>(fa: Bracket<E, A>) => (
  <B>(fab: Bracket<E, (a: A) => B>) => Apply.ap(fab, fa)
);

export const apFirst = $Apply.apFirst(Apply);
export const apSecond = $Apply.apSecond(Apply);
export const apS = $Apply.apS(Apply);
export const getApplySemigroup = $Apply.getApplySemigroup(Apply);
export const sequenceT = $Apply.sequenceT(Apply);
export const sequenceS = $Apply.sequenceS(Apply);

export const Applicative: $Applicative.Applicative2<URI> = {...Pointed, ...Apply};

export const ApplyPar: $Apply.Apply2<URI> = {
  ...Functor,
  ap: <E, A, B>(fab: Bracket<E, (a: A) => B>, fa: Bracket<E, A>) => (
    <T>(consume: (resource: B) => TE.TaskEither<E, T>): TE.TaskEither<E, T> => (
      () => {
        let ab: O.Option<(a: A) => B> = O.none;
        let a: O.Option<A> = O.none;

        let resolvedFa: O.Option<E.Either<E, T>> = O.none;
        let resolveFa = (value: E.Either<E, T>) => {
          resolvedFa = O.some(value);
        };

        let resolvedFab: O.Option<E.Either<E, T>> = O.none;
        let resolveFab = (value: E.Either<E, T>) => {
          resolvedFab = O.some(value);
        };

        const promiseFa = fa(x => () => {
          if (O.isSome(resolvedFa)) {
            return Promise.resolve(resolvedFa.value);
          }
          if (O.isSome(ab)) {
            return consume(ab.value(x))();
          }
          return new Promise<E.Either<E, T>>(resolve => {
            a = O.some(x);
            resolveFa = resolve;
          });
        })().then(ea => {
          resolveFab(ea);
          return ea;
        });

        const promiseFab = fab(f => () => {
          if (O.isSome(resolvedFab)) {
            return Promise.resolve(resolvedFab.value);
          }
          if (O.isSome(a)) {
            return consume(f(a.value))().then(ret => {
              resolveFa(ret);
              return promiseFa.then(retFa => pipe(retFa, E.apSecond(ret)));
            });
          }
          return new Promise<E.Either<E, T>>(resolve => {
            ab = O.some(f);
            resolveFab = resolve;
          });
        })().then(eab => {
          resolveFa(eab);
          return eab;
        });

        return Promise.all([promiseFab, promiseFa]).then(([eab]) => eab);
      }
    )
  ),
};

export const apPar = <E, A>(fa: Bracket<E, A>) => (
  <B>(fab: Bracket<E, (a: A) => B>) => ApplyPar.ap(fab, fa)
);

export const apFirstPar = $Apply.apFirst(ApplyPar);
export const apSecondPar = $Apply.apSecond(ApplyPar);
export const apSPar = $Apply.apS(ApplyPar);
export const getApplySemigroupPar = $Apply.getApplySemigroup(ApplyPar);
export const sequenceTPar = $Apply.sequenceT(ApplyPar);
export const sequenceSPar = $Apply.sequenceS(ApplyPar);

export const ApplicativePar: $Applicative.Applicative2<URI> = {...Pointed, ...ApplyPar};

export const Chain: $Chain.Chain2<URI> = {
  ...Apply,
  chain: (fa, f) => use => fa(a => f(a)(use))
};

export const chain = <E, A, B>(f: (a: A) => Bracket<E, B>) => (
  (fa: Bracket<E, A>) => Chain.chain(fa, f)
);

export const chainFirst = $Chain.chainFirst(Chain);
export const bind = $Chain.bind(Chain);

export const Monad: $Monad.Monad2<URI> = {...Pointed, ...Chain};

export const fromTaskEither: NaturalTransformation22<TE.URI, URI> = (
  task => use => pipe(task, TE.chain(use))
);
