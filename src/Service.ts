import * as R from 'fp-ts/Reader';
import * as RT from 'fp-ts/ReaderT';
import * as B from './Bracket';

export type Service<E, D, S> = R.Reader<D, B.Bracket<E, S>>;

export type ResourceOf<S extends Service<any, any, any>> = (
  S extends Service<any, any, infer R> ? R : never
);

export const of = RT.of(B.Pointed);
export const map = RT.map(B.Functor);
export const ap = RT.ap(B.Apply);
export const apPar = RT.ap(B.ApplyPar);
export const chain = RT.chain(B.Chain);
export const fromReader = RT.fromReader(B.Pointed);
