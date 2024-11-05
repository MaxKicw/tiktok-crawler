// functions/src/index.ts
const functions = require('firebase-functions');
const { ApifyClient } = require('apify-client');
const dayjs = require('dayjs');
const APIFY_APIKEY = functions.config().apify.apikey;
const GOOGLE_SERVICE_ACCOUNT_EMAIL =
  functions.config().googlesheets.googleserviceaccountemail;
const GOOGLE_PRIVATE_KEY = functions.config().googlesheets.googleprivatekey;
const { JWT } = require('google-auth-library');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const client = new ApifyClient({
  token: APIFY_APIKEY,
});

const serviceAccountAuth = new JWT({
  email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const addDataToRow = (row, items, rows, i) =>
  new Promise((res) => {
    (async () => {
      try {
        const rowLink = row._rawData.find((e) => e.includes('tiktok.com'));
        const resultData = items.find((l) => l.submittedVideoUrl === rowLink);
        Object.entries(resultData).forEach(([key, value]) => {
          rows[i].set(key, JSON.stringify(value));
        });

        rows[i].set('lastSync', dayjs().toISOString());
        await rows[i].save();
        res();
      } catch (error) {
        res();
      }
    })();
  });
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '1GB',
};
exports.getVideoData = functions
  .region('europe-west3')
  .runWith(runtimeOpts)
  .https.onRequest(async (req, res) => {
    try {
      const spreadSheetId = req.body.spreadSheetId;
      const spreadSheetTableName = req.body.spreadSheetTableName;
      const specificRow = req.body?.specificRow ?? undefined;
      const rowLimit = req.body?.rowLimit ?? undefined;
      const agentId = req.body?.agentId ?? undefined;
      const onlyNew = req.body?.onlyNew ?? false;
      if (!spreadSheetId)
        res.send({ message: 'Please deliver the spreadsheet url' });
      // Readout the spreadsheet data
      const doc = new GoogleSpreadsheet(spreadSheetId, serviceAccountAuth);
      await doc.loadInfo();
      //   Load the sheet rows
      const sheet = doc.sheetsByTitle[spreadSheetTableName];
      await sheet.loadCells();
      const rows = await sheet.getRows();
      const availableRows = rowLimit ? rows.slice(0, rowLimit) : rows;
      const usedRows = onlyNew
        ? availableRows.filter((r) => !r._rawData.includes('crawledOnce'))
        : availableRows;
      //   Find all tiktok Links
      const tikTokUrls = usedRows.flatMap((row, i) => {
        const tikTokLink = row._rawData.find((e) => e.includes('tiktok.com'));
        return specificRow !== undefined
          ? specificRow === i
            ? tikTokLink
            : []
          : tikTokLink ?? [];
      });
      if (tikTokUrls.length === 0) {
        res.send({ message: 'No new rows to update' });
        return;
      }
      const currentHeaders = await sheet.headerValues;
      const limit = 100;
      const input = {
        excludePinnedPosts: false,
        postURLs: tikTokUrls,
        resultsPerPage: limit,
        shouldDownloadCovers: false,
        shouldDownloadSlideshowImages: false,
        shouldDownloadSubtitles: false,
        shouldDownloadVideos: false,
      };
      // How many pages are expected
      const expectedPages = Math.ceil(tikTokUrls.length / limit);
      const mapArray = Array.from(Array(expectedPages).keys());

      // Call the actor asynchronously
      const run = await client
        .actor(agentId ?? 'OtzYfK1ndEGdwWFKQ')
        .call(input);
      // Retrieve the items asynchronously
      // Retrieve the items asynchronously
      const pages = await Promise.all(
        mapArray.map(
          async (i) =>
            await client
              .dataset(run.defaultDatasetId)
              .listItems({ offset: i * limit, limit })
        )
      );
      const items = pages.map((p) => p.items).flat();
      const uniqueNewHeaders = Object.keys(items[0]).filter(
        (header) => !currentHeaders.includes(header)
      );

      try {
        const newHeaders = [...currentHeaders, ...uniqueNewHeaders, 'lastSync'];
        await sheet.setHeaderRow(newHeaders);
      } catch (error) {
        console.log(error);
      }

      if (specificRow !== undefined) {
        await addDataToRow(usedRows[specificRow], items, usedRows, specificRow);
      } else {
        await Promise.all(
          usedRows.map((row, i) => addDataToRow(row, items, usedRows, i))
        );
      }
      res.status(200).send('Success'); // Handle error response
    } catch (error) {
      console.error('Error retrieving video data:', error);
      res.status(500).send('Internal Server Error'); // Handle error response
    }
  });

exports.test = functions.https.onRequest(async (req, res) => {
  res.status(200).send('Success'); // Handle error response
});
