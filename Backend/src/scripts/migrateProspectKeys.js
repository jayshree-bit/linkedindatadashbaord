
import mongoose from 'mongoose';
import Prospect from '../models/Prospect.js';
import dotenv from 'dotenv';

dotenv.config();

const fieldMap = {
  'Employee Code': 'employeeCode',
  'Employee Name': 'employeeName',
  Date: 'date',
  Campaign: 'campaign',
  'First Name': 'firstName',
  'Last Name': 'lastName',
  'Company Name': 'companyName',
  'Email Address': 'emailAddress',
  'Specific Title': 'specificTitle',
  'Job Level': 'jobLevel',
  'Job Role': 'jobRole',
  'Phone Number': 'phoneNumber',
  'Address 1': 'address1',
  'Address 2': 'address2',
  City: 'city',
  State: 'state',
  Zipcode: 'zipcode',
  Country: 'country',
  'Main Industry': 'mainIndustry',
  Industry: 'industry',
  'See All Employee Size': 'seeAllEmployeeSize',
  'Employee Size': 'employeeSize',
  'Exact Revenue': 'exactRevenue',
  Revenue: 'revenue',
  'Company Domain': 'companyDomain',
  Website: 'website',
  'Company Linkedin URL': 'companyLinkedinUrl',
  'LinkedIn Profile Link': 'linkedinProfileLink',
  'LinkedIn Profile Link SN': 'linkedinProfileLinkSN',
  'Revenue Link': 'revenueLink',
  'SIC Code': 'sicCode',
  'NAICS Code': 'naicsCode',
  'Prospect Tenure': 'prospectTenure',
  'RA Comment': 'raComment',
  'Address Link': 'addressLink',
  'Call Notes': 'callNotes',
  Dispositions: 'dispositions',
  Note1: 'note1',
  Note2: 'note2',
  Note3: 'note3',
  Status: 'status',
  'Primary Reason': 'primaryReason',
  'QA Comment': 'qaComment',
  'EBB Status': 'ebbStatus',
  'Auditor Name': 'auditorName',
  'Audit Date': 'auditDate',
};

async function migrate() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing from your .env file');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const collection = Prospect.collection;
  const total = await collection.countDocuments();
  console.log(`Found ${total} prospect records`);

  // Preview first: set DRY_RUN=false only when ready to migrate.
  const dryRun = process.env.DRY_RUN !== 'false';
  let processed = 0;
  let changed = 0;

  const cursor = collection.find(
    {},
    { projection: { _id: 1, ...Object.fromEntries(
      Object.keys(fieldMap).map((key) => [key, 1])
    ) } }
  ).batchSize(500);

  let operations = [];

  for await (const doc of cursor) {
    const rename = {};

    for (const [oldKey, newKey] of Object.entries(fieldMap)) {
      // Preserve existing camelCase data; do not overwrite it.
      if (
        Object.prototype.hasOwnProperty.call(doc, oldKey) &&
        !Object.prototype.hasOwnProperty.call(doc, newKey)
      ) {
        rename[oldKey] = newKey;
      }
    }

    if (Object.keys(rename).length) {
      changed++;

      if (!dryRun) {
        operations.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $rename: rename },
          },
        });
      }
    }

    processed++;

    if (operations.length >= 500) {
      await collection.bulkWrite(operations, { ordered: false });
      operations = [];
    }

    if (processed % 1000 === 0) {
      console.log(`Checked ${processed}/${total}`);
    }
  }

  if (!dryRun && operations.length) {
    await collection.bulkWrite(operations, { ordered: false });
  }

  console.log({
    totalRecords: total,
    checkedRecords: processed,
    recordsWithKeysToRename: changed,
    mode: dryRun ? 'DRY RUN - no changes made' : 'MIGRATION COMPLETE',
  });

  await mongoose.disconnect();
}

migrate().catch(async (error) => {
  console.error('Migration failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
