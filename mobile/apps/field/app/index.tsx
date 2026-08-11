import { Redirect } from 'expo-router';

import { useFieldStore } from '../src/state/fieldStore';

export default function IndexRoute() {
  const session = useFieldStore((state) => state.session);
  return <Redirect href={session ? '/(tabs)/home' : '/shift'} />;
}
