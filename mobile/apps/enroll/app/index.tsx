import { Redirect } from 'expo-router';

import { useEnrollStore } from '../src/state/enrollStore';

export default function IndexScreen() {
  const operatorId = useEnrollStore((state) => state.operatorId);
  return <Redirect href={operatorId ? '/(tabs)/roster' : '/operator'} />;
}
