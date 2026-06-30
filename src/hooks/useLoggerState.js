import { useState, useEffect } from 'react';
import { state } from '../state';

export function useLoggerState() {
  const [snapshot, setSnapshot] = useState({ ...state });

  useEffect(() => {
    // 订阅全局状态变更
    return state.subscribe(() => {
      // 产生深/浅拷贝新引用触发组件刷新
      setSnapshot({
        ...state,
        logs: [...state.logs],
        consoleLevels: { ...state.consoleLevels }
      });
    });
  }, []);

  return snapshot;
}
