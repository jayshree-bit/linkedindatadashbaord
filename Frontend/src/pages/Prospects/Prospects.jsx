import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import DataGridPage from '../../components/DataGridPage';

const fields = [
  { key: 'employeeCode', name: 'Employee Code' },
  { key: 'employeeName', name: 'Employee Name' },
  { key: 'date', name: 'Date' },
  { key: 'campaign', name: 'Campaign' },
  { key: 'firstName', name: 'First Name' },
  { key: 'lastName', name: 'Last Name' },
  { key: 'companyName', name: 'Company Name' },
  { key: 'emailAddress', name: 'Email Address' },
  { key: 'specificTitle', name: 'Specific Title' },
  { key: 'jobLevel', name: 'Job Level' },
  { key: 'jobRole', name: 'Job Role' },
  { key: 'phoneNumber', name: 'Phone Number' },
  { key: 'address1', name: 'Address 1' },
  { key: 'address2', name: 'Address 2' },
  { key: 'city', name: 'City' },
  { key: 'state', name: 'State' },
  { key: 'zipcode', name: 'Zipcode' },
  { key: 'country', name: 'Country' },
  { key: 'mainIndustry', name: 'Main Industry' },
  { key: 'industry', name: 'Industry' },
  { key: 'seeAllEmployeeSize', name: 'Company Employee Count' },
  { key: 'employeeSize', name: 'Employee Size Range' },
  { key: 'exactRevenue', name: 'Exact Revenue' },
  { key: 'revenue', name: 'Revenue Range' },
  { key: 'companyDomain', name: 'Company Domain' },
  { key: 'website', name: 'Website' },
  { key: 'companyLinkedinUrl', name: 'Company LinkedIn URL' },
  { key: 'linkedinProfileLink', name: 'LinkedIn Profile Link' },
  { key: 'linkedinProfileLinkSN', name: 'LinkedIn Profile Link SN' },
  { key: 'revenueLink', name: 'Revenue Link' },
  { key: 'sicCode', name: 'SIC Code' },
  { key: 'naicsCode', name: 'NAICS Code' },
  { key: 'prospectTenure', name: 'Prospect Tenure' },
  { key: 'raComment', name: 'RA Comment' },
  { key: 'addressLink', name: 'Address Link' },
  { key: 'callNotes', name: 'Call Notes' },
  { key: 'dispositions', name: 'Dispositions' },
  { key: 'note1', name: 'Note 1' },
  { key: 'note2', name: 'Note 2' },
  { key: 'note3', name: 'Note 3' },
  { key: 'status', name: 'Status' },
  { key: 'primaryReason', name: 'Primary Reason' },
  { key: 'qaComment', name: 'QA Comment' },
  { key: 'ebbStatus', name: 'EBB Status' },
  { key: 'auditorName', name: 'Auditor Name' },
  { key: 'auditDate', name: 'Audit Date' },
  { key: 'uploadedByName', name: 'Uploaded By' },
];

export default function Prospects() {
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || '';
  const userId = searchParams.get('userId') || '';
  const employee = searchParams.get('employee') || '';

  // Locked filters coming from the dashboard link.
  // `userId` is a special key: the backend turns it into the same condition
  // the dashboard stats use for that user.
  const fixedFilters = useMemo(() => {
    const f = {};
    if (statusFilter) {
      f.status = { op: 'equals', text: statusFilter, values: null };
    }
    if (userId) {
      f.userId = { op: 'equals', text: userId, values: null };
    }
    return f;
  }, [statusFilter, userId]);

  const baseTitle =
    statusFilter === 'Qualified'
      ? 'Qualified Prospects'
      : statusFilter === 'DisQualified'
        ? 'Disqualified Prospects'
        : 'All Prospects';

  return (
    <DataGridPage
      resource="prospect"
      title={employee ? `${baseTitle} – ${employee}` : baseTitle}
      fields={fields}
      fixedFilters={fixedFilters}
    />
  );
}