
import DataGridPage from '../components/DataGridPage';

const fields = [
 
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
  { key: 'Sub Industry', name: 'Sub Industry' },
  { key: 'See All Employee Size', name: 'Exact Employee Size' },
  { key: 'Employee Size', name: 'Employee Size' },
  { key: 'Exact Revenue', name: 'Exact Revenue' },
  { key: 'Revenue', name: 'Revenue' },
  { key: 'Company Domain', name: 'Company Domain' },
  { key: 'Website', name: 'Website' },
  { key: 'Company Linkedin URL', name: 'Company LinkedIn URL' },
  { key: 'LinkedIn Profile Link', name: 'LinkedIn Profile Link' },
  { key: 'LinkedIn Profile Link SN', name: 'LinkedIn Profile Link SN' },
  { key: 'Revenue Link', name: 'Revenue Link' },
  { key: 'SIC Code', name: 'SIC Code' },
  { key: 'NAICS Code', name: 'NAICS Code' },
  { key: 'Prospect Tenure', name: 'Prospect Tenure' },
  { key: 'RA Comments', name: 'RA Comments' },
  { key: 'Address Link', name: 'Address Link' },
  { key: 'Call Notes', name: 'Call Notes' },
  { key: 'Dispositions', name: 'Dispositions' },
  { key: 'Prospect City', name: 'Prospect City' },
  { key: 'Prospect State', name: 'Prospect State' },
  { key: 'Prospect Country', name: 'Prospect Country' },
];

export default function Companies() {
  return (
    <DataGridPage
      resource="company"
      title="Companies"
      fields={fields}
    />
  );
}
