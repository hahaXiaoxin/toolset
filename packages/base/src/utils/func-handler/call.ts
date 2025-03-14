import type { TAnyFunc, TFunc } from '$/types/base';
import { isPromise } from '../verify';

/**
 * try catch 的封装, 如果函数内报错, 则会被 catcher 捕获, 如果为传递, 则会直接抛出错误
 * 支持异步函数
 */
export function tryCall<F extends TAnyFunc>(runner: F, catcher?: (e: any) => void): ReturnType<F> | void {
  const _catcher = (e: any) => {
    if (catcher) {
      catcher(e);
      return;
    }
    throw e;
  };
  try {
    const result = runner();
    if (isPromise(result)) {
      result.catch(_catcher);
    }
    return result;
  }
  catch (e) {
    _catcher(e);
  }
}

/**
 * 安全的执行函数, 如果函数内出现报错, 则返回错误对象而不是抛出错误
 */
export function completion<T, A extends any[]>(func: (...args: A) => T, ...args: A): T | Error {
  try {
    return func(...args);
  }
  catch (e: any) {
    return e;
  }
}

/**
 * 立即执行函数
 */
export function iife<R>(func: TFunc<[], R>): R;
export function iife<T extends any[], R>(func: TFunc<T, R>, args: T): R;
export function iife<T extends any[], R>(func: TFunc<T, R>, args?: T) {
  /**
   * 20250313 - cmtlyt
   * 扩展运算符可以作用于 undefined, 但是只支持对象内使用
   * 此处为数组展开, 所以需要对 args 进行兜底处理
   */
  return func(...(args || []) as any);
}
