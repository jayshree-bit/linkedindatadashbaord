
import DataGridPage from '../components/DataGridPage';

const fields = [
  { key: 'Employee Code', name: 'Employee Code' },
  { key: 'Employee Name', name: 'Employee Name' },
  { key: 'Date', name: 'Date' },
  { key: 'Campaign', name: 'Campaign' },
  { key: 'First Name', name: 'First Name' },
  { key: 'Last Name', name: 'Last Name' },
  { key: 'Company Name', name: 'Company Name' },
  { key: 'Email Address', name: 'Email Address' },
  { key: 'Specific Title', name: 'Specific Title' },
  { key: 'Job Level', name: 'Job Level' },
  { key: 'Job Role', name: 'Job Role' },
  { key: 'Phone Number', name: 'Phone Number' },
  { key: 'Address 1', name: 'Address 1' },
  { key: 'Address 2', name: 'Address 2' },
  { key: 'City', name: 'City' },
  { key: 'State', name: 'State' },
  { key: 'Zipcode', name: 'Zipcode' },
  { key: 'Country', name: 'Country' },
  { key: 'Main Industry', name: 'Main Industry' },
  { key: 'Industry', name: 'Industry' },
  { key: 'See All Employee Size', name: 'Company Employee Count' },
  { key: 'Employee Size', name: 'Employee Size Range' },
  { key: 'Exact Revenue', name: 'Exact Revenue' },
  { key: 'Revenue', name: 'Revenue Range' },
  { key: 'Company Domain', name: 'Company Domain' },
  { key: 'Website', name: 'Website' },
  { key: 'Company Linkedin URL', name: 'Company LinkedIn URL' },
  { key: 'LinkedIn Profile Link', name: 'LinkedIn Profile Link' },
  { key: 'LinkedIn Profile Link SN', name: 'LinkedIn Profile Link SN' },
  { key: 'Revenue Link', name: 'Revenue Link' },
  { key: 'SIC Code', name: 'SIC Code' },
  { key: 'NAICS Code', name: 'NAICS Code' },
  { key: 'Prospect Tenure', name: 'Prospect Tenure' },
  { key: 'RA Comment', name: 'RA Comment' },
  { key: 'Address Link', name: 'Address Link' },
  { key: 'Call Notes', name: 'Call Notes' },
  { key: 'Dispositions', name: 'Dispositions' },
  { key: 'Note1', name: 'Note 1' },
  { key: 'Note2', name: 'Note 2' },
  { key: 'Note3', name: 'Note 3' },
  { key: 'Status', name: 'Status' },
  { key: 'Primary Reason', name: 'Primary Reason' },
  { key: 'QA Comment', name: 'QA Comment' },
  { key: 'EBB Status', name: 'EBB Status' },
  { key: 'Auditor Name', name: 'Auditor Name' },
  { key: 'Audit Date', name: 'Audit Date' },
];

export default function Prospects() {
  return (
    <DataGridPage
      resource="prospect"
      title="Prospects"
      fields={fields}
    />
  );
}
