import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { getUserData } from '@/lib/data';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  // Diagnostic log to inspect the session object
  console.log('Session object in DashboardPage:', JSON.stringify(session, null, 2));

  if (!session || !session.user) {
    redirect('/');
  }

  const initialData = await getUserData(session.user.id as string);

  return <DashboardClient initialData={initialData} />;
}
