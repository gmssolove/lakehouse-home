import { redirect } from 'next/navigation';

export default function RecordsIndexPage() {
  redirect('/?p=diary');
}
