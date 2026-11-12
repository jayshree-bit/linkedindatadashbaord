import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import DataGridPage from '../../components/DataGridPage';
import DateRangeFilter from '../../components/DateRangeFilter';
import LinkedinLogPanel from '../../components/LinkedinLogPanel';
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
  { key: 'companySocials', name: 'Company Socials' },
  { key: 'note3', name: 'Note 3' },
  { key: 'status', name: 'Status' },
  { key: 'primaryReason', name: 'Primary Reason' },
  { key: 'qaComment', name: 'QA Comment' },
  { key: 'ebbStatus', name: 'EBB Status' },
  { key: 'auditorName', name: 'Auditor Name' },
  { key: 'auditDate', name: 'Audit Date' },
  { key: 'uploadedByName', name: 'Uploaded By' },
  {key:'updatedAt', name:'Updated At'},
];
const UPDATE_MARK = 'Update Profile'; // the script writes this into note1

const cardConfig = {
  title: (r) =>
    [r.firstName, r.lastName].filter(Boolean).join(' ') || r.employeeName || '—',

  subtitle: (r) =>
    [r.specificTitle, r.companyName].filter(Boolean).join(' · '),

  badgeKey: 'status',

  items: [
    'emailAddress',
    'phoneNumber',
    'linkedinProfileLink',
    'city',
    'country',
    'campaign',
    'employeeName',
    {
      key: 'note2',
      label: 'Work Mode',
    },
     {
      key: 'companySocials',
      label: 'Company Socials',
    },
  ],
};
export default function Prospects() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || '';
  const userId = searchParams.get('userId') || '';
  const employee = searchParams.get('employee') || '';
  const tab = searchParams.get('tab') || 'all'; // all | updated | pending
  const fromDate = searchParams.get('from') || '';
  const toDate = searchParams.get('to') || '';

  const setParam = (name, value) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(name, value);
    else params.delete(name);
    setSearchParams(params);
  };

  const setTab = (next) => setParam('tab', next === 'all' ? '' : next);

  // The date range only makes sense on All and Updated.
  const dateEnabled = tab !== 'pending' && tab !== 'log';
  const rangeInvalid = Boolean(fromDate && toDate && fromDate > toDate);

  const fixedFilters = useMemo(() => {
    const f = {};
    if (statusFilter) f.status = { op: 'equals', text: statusFilter, values: null };
    if (userId) f.userId = { op: 'equals', text: userId, values: null };
    if (tab === 'updated') {
      f.note1 = { op: 'contains', text: UPDATE_MARK, values: null };
    } else if (tab === 'pending') {
      f.note1 = { op: 'notContains', text: UPDATE_MARK, values: null };
    }
    if (dateEnabled && !rangeInvalid && (fromDate || toDate)) {
      f.updatedAtRange = { from: fromDate || null, to: toDate || null };
    }
    return f;
  }, [statusFilter, userId, tab, dateEnabled, rangeInvalid, fromDate, toDate]);

  const baseTitle =
    statusFilter === 'Qualified'
      ? 'Qualified Prospects'
      : statusFilter === 'DisQualified'
        ? 'Disqualified Prospects'
        : 'All Prospects';

  const tabLabel =
    tab === 'updated' ? ' (Updated)' : tab === 'pending' ? ' (Not updated)' : '';
   const setRange = ({ from, to }) => {
    const params = new URLSearchParams(searchParams);
    if (from) params.set('from', from);
    else params.delete('from');
    if (to) params.set('to', to);
    else params.delete('to');
    setSearchParams(params);
  };
const DEFAULT_SORT = [{ columnKey: 'updatedAt', direction: 'DESC' }];
  return (
    <>
      <div className="dgp-tabs" role="tablist">
        {[
          ['all', 'All'],
          ['updated', 'Updated'],
          ['pending', 'Not updated'], 
           ['log', 'Download log'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`dgp-tab ${tab === id ? 'on' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

           {dateEnabled && (
        <DateRangeFilter from={fromDate} to={toDate} onChange={setRange} />
      )}

      {tab === 'log' ? (
        <LinkedinLogPanel />
      ) : (
        <DataGridPage
          resource="prospect"
          title={`${employee ? `${baseTitle} – ${employee}` : baseTitle}${tabLabel}`}
          fields={fields}
          fixedFilters={fixedFilters}
          cardConfig={cardConfig}
          defaultSort={DEFAULT_SORT}
        />
      )}
    </>
  );
}