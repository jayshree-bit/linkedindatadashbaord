import DataGridPage from '../components/DataGridPage';

export default function Companies() {

  // One source of truth: the grid and the import modal both use this order.
const COMPANY_COLUMNS = [
  { key: 'name', name: 'Company Name' },
  { key: 'emailAddress', name: 'Email Format' },
  { key: 'phoneNumber', name: 'Phone Number' },
  { key: 'address1', name: 'Address 1' },
  { key: 'city', name: 'City' },
  { key: 'state', name: 'State' },
  { key: 'zipcode', name: 'Zipcode' },
  { key: 'country', name: 'Country' },
  { key: 'industry', name: 'Main Industry' },
  { key: 'subIndustry', name: 'Sub Industry' },
  { key: 'exactEmployeeSize', name: 'See All Employee Size' },
  { key: 'employeeSize', name: 'Employee Size Bracket' },
  { key: 'exactRevenue', name: 'Exact Revenue' },
  { key: 'revenue', name: 'Revenue Bracket' },
  { key: 'domain', name: 'Company Domain' },
  { key: 'website', name: 'Website' },
  { key: 'linkedinUrl', name: 'Company Linkedin URL' },
  { key: 'revenueLink', name: 'Revenue Link' },
  { key: 'sicCode', name: 'SIC Code' },
  { key: 'naicsCode', name: 'NAICS Code' },
  { key: 'raComments', name: 'Agent Comments' },
  { key: 'addressLink', name: 'Address Link' },
  { key: 'callNotes', name: 'Call Notes' },
  { key: 'note1', name: 'Note1' },
  { key: 'note2', name: 'Note2' },
  { key: 'note3', name: 'Note3' },
];
  return (
    <DataGridPage
      resource="company"
      title="Companies"
      fields={COMPANY_COLUMNS}
    />
  );
}