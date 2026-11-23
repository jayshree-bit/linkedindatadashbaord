import DataGridPage from '../components/DataGridPage';

export default function Companies() {
  // Keep the grid columns aligned with the Company model fields.
  const COMPANY_COLUMNS = [
    { key: 'organizationId', name: 'Organization ID' },
    { key: 'name', name: 'Company Name' },
    { key: 'companyLogo', name: 'Company Logo' },
    { key: 'emailAddress', name: 'Email Format' },
    { key: 'FAX', name: 'FAX' },
    { key: 'headquarterPhone', name: 'Headquarter Phone' },
    { key: 'address1', name: 'Address 1' },
    { key: 'address2', name: 'Address 2' },
    { key: 'city', name: 'City' },
    { key: 'state', name: 'State' },
    { key: 'zipcode', name: 'Zipcode' },
    { key: 'country', name: 'Country' },
    { key: 'headquarter', name: 'Headquarter' },
    { key: 'primaryAddress', name: 'Primary Address' },
    { key: 'addressLink', name: 'Address Link' },
    { key: 'industry', name: 'Main Industry' },
    { key: 'industryDetail', name: 'Industry Detail' },
    { key: 'subIndustry', name: 'Sub Industry' },
    { key: 'specialties', name: 'Specialties' },
    { key: 'type', name: 'Type' },
    { key: 'keywords', name: 'Keywords' },
    { key: 'technologies', name: 'Technologies' },
    { key: 'companySize', name: 'Company Size' },
    { key: 'exactEmployeeSize', name: 'Exact Employee Size' },
    { key: 'employeesLink', name: 'Employees Link' },
    { key: 'linkedinFollowers', name: 'LinkedIn Followers' },
    { key: 'exactRevenue', name: 'Exact Revenue' },
    { key: 'revenue', name: 'Revenue' },
    { key: 'competitors', name: 'Competitors' },
    { key: 'annualRevenue', name: 'Annual Revenue' },
    { key: 'revenueLink', name: 'Revenue Link' },
    { key: 'domain', name: 'Domain' },
    { key: 'website', name: 'Website' },
    { key: 'websiteAsPerLinkedin', name: 'Website as per LinkedIn' },
    { key: 'linkedinUrl', name: 'LinkedIn URL' },
    { key: 'salesNavigatorLink', name: 'Sales Navigator Link' },
    { key: 'domainRank', name: 'Domain Rank' },
    { key: 'facebookUrl', name: 'Facebook URL' },
    { key: 'instagramUrl', name: 'Instagram URL' },
    { key: 'twitterUrl', name: 'Twitter URL' },
    { key: 'tiktokUrl', name: 'TikTok URL' },
    { key: 'youtubeUrl', name: 'YouTube URL' },
    { key: 'status', name: 'Status' },
    { key: 'httpStatus', name: 'HTTP Status' },
    { key: 'apolloStatus', name: 'Apollo Status' },
    { key: 'zoominfo', name: 'ZoomInfo' },
    { key: 'qcStatus', name: 'QC Status' },
    { key: 'description', name: 'Description' },
    { key: 'stockSymbol', name: 'Stock Symbol' },
    { key: 'totalFunding', name: 'Total Funding' },
    { key: 'latestFunding', name: 'Latest Funding' },
    { key: 'latestFundingAmount', name: 'Latest Funding Amount' },
    { key: 'lastRaisedAt', name: 'Last Raised At' },
    { key: 'scrapedAt', name: 'Scraped At' },
    { key: 'sicCode', name: 'SIC Code' },
    { key: 'naicsCode', name: 'NAICS Code' },
    { key: 'raComments', name: 'RA Comments' },
    { key: 'callNotes', name: 'Call Notes' },
    { key: 'note1', name: 'Note 1' },
    { key: 'note2', name: 'Note 2' },
    { key: 'note3', name: 'Note 3' },

  
    { key: 'uploadedByName', name: 'Uploaded By' },
  
    { key: 'createdAt', name: 'Created At' },
    { key: 'updatedAt', name: 'Updated At' },
  ];
const COMPANY_CARD = {
  title: (r) => r.name || "—",
  subtitle: (r) => r.domain || "",
  imageKey: "companyLogo",          // logo shown as an image
  imageShape: "square",
  socialKeys: [             
    "linkedinUrl", "facebookUrl", "instagramUrl",
    "twitterUrl", "youtubeUrl", "tiktokUrl", "website",
  ],
  modalShowAll: true,              
  items: [
    { key: "industry", label: "Main Industry" },
    { key: "companySize", label: "Company Size" },
    { key: 'headquarterPhone', name: 'Headquarter Phone' },
    { key: "revenue", label: "Revenue" },
   
  ],
};
  return (
    <DataGridPage
      resource="company"
      title="Companies"
      fields={COMPANY_COLUMNS}
      cardConfig={COMPANY_CARD}
    />
  );
}