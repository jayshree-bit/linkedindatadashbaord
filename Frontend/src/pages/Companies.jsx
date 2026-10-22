import DataGridPage from '../components/DataGridPage';
const fields = [
  { key: 'name', name: 'Company' }, { key: 'industry', name: 'Industry' },
  { key: 'website', name: 'Website' }, { key: 'location', name: 'Location' },
];
export default function Companies() {
  return <DataGridPage resource="company" title="Companies" fields={fields} />;
}