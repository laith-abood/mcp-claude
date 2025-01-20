#!/usr/bin/env node

import { authenticate } from "@google-cloud/local-auth";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import { google } from "googleapis";
import path from "path";
import { sheets_v4 } from "googleapis";
import { OAuth2Client } from 'google-auth-library';
import http from 'http';
import { AddressInfo } from 'net';
import open from 'open';
import url from 'url';

const drive = google.drive("v3");
const sheets = google.sheets("v4");

function debug(message: string) {
  if (process.env.DEBUG === 'true') {
    console.error(`[DEBUG] ${message}`);
  }
}

const server = new Server(
  {
    name: "example-servers/gdrive",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

interface SheetFormatting {
  backgroundColor?: sheets_v4.Schema$Color;
  textFormat?: sheets_v4.Schema$TextFormat;
  borders?: sheets_v4.Schema$Borders;
}

interface ChartInfo {
  chartId: number;
  type: string;
  title: string;
  range: string;
}

interface PivotTableInfo {
  source: string;
  rows: Array<{column: string}>;
  columns: Array<{column: string}>;
  values: Array<{summarizeFunction: string}>;
}

interface ExtendedSheet extends sheets_v4.Schema$Sheet {
  pivotTables?: { [key: string]: sheets_v4.Schema$PivotTable };
}

// Helper function to get sheet formatting
async function getSheetFormatting(spreadsheetId: string, range: string): Promise<SheetFormatting[][]> {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [range],
    includeGridData: true,
  });

  const gridData = response.data.sheets?.[0].data?.[0];
  return (gridData?.rowData?.map(row => 
    row.values?.map(cell => ({
      backgroundColor: cell.effectiveFormat?.backgroundColor || undefined,
      textFormat: cell.effectiveFormat?.textFormat || undefined,
      borders: cell.effectiveFormat?.borders || undefined,
    })) || []
  ) || []) as SheetFormatting[][];
}

// Helper function to get charts
async function getCharts(spreadsheetId: string, sheetId: number): Promise<ChartInfo[]> {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
  });

  const sheet = response.data.sheets?.find(s => s.properties?.sheetId === sheetId);
  return sheet?.charts?.map(chart => ({
    chartId: chart.chartId!,
    type: chart.spec?.basicChart?.chartType || 'Unknown',
    title: chart.spec?.title || 'Untitled',
    range: chart.spec?.basicChart?.domains?.[0]?.domain?.sourceRange?.sources?.[0]?.startRowIndex + ':' +
           chart.spec?.basicChart?.domains?.[0]?.domain?.sourceRange?.sources?.[0]?.endRowIndex || 'Unknown',
  })) || [];
}

// Helper function to get pivot tables
async function getPivotTables(spreadsheetId: string, sheetId: number): Promise<PivotTableInfo[]> {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
  });

  const sheet = response.data.sheets?.find(s => s.properties?.sheetId === sheetId) as ExtendedSheet;
  if (!sheet?.pivotTables) return [];
  
  return Object.entries(sheet.pivotTables).map(([_, pivot]) => {
    const pivotTable = pivot as sheets_v4.Schema$PivotTable;
    
    return {
      source: 'Sheet range',
      rows: (pivotTable.rows || []).map(() => ({
        column: 'Row field'
      })),
      columns: (pivotTable.columns || []).map(() => ({
        column: 'Column field'
      })),
      values: (pivotTable.values || []).map(val => ({
        summarizeFunction: val.summarizeFunction || ''
      }))
    };
  });
}

// Enhanced sheet data function
async function getSheetData(fileId: string) {
  try {
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: fileId,
      includeGridData: true,
    });

    const spreadsheet = metadata.data;
    let fullContent = `# ${spreadsheet.properties?.title || 'Spreadsheet'}\n\n`;

    for (const sheet of spreadsheet.sheets!) {
      const sheetName = sheet.properties!.title;
      fullContent += `## Sheet: ${sheetName}\n\n`;

      // Get basic sheet properties
      fullContent += `Properties:\n`;
      fullContent += `- Rows: ${sheet.properties?.gridProperties?.rowCount}\n`;
      fullContent += `- Columns: ${sheet.properties?.gridProperties?.columnCount}\n\n`;

      // Get sheet data
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: fileId,
        range: sheetName!,
        valueRenderOption: 'FORMULA',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });

      const values = response.data.values || [];
      
      // Format as markdown table
      if (values.length > 0) {
        fullContent += "### Data\n\n";
        // Header
        fullContent += "| " + values[0].join(" | ") + " |\n";
        fullContent += "|" + values[0].map(() => "---").join("|") + "|\n";
        
        // Data rows
        for (let i = 1; i < values.length; i++) {
          fullContent += "| " + values[i].join(" | ") + " |\n";
        }
      }

      // Add formulas
      const gridData = sheet.data?.[0];
      if (gridData?.rowData) {
        fullContent += "\n### Formulas\n\n";
        gridData.rowData.forEach((row, rowIndex) => {
          if (row.values) {
            row.values.forEach((cell, colIndex) => {
              if (cell.userEnteredValue?.formulaValue) {
                const cellRef = `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`;
                fullContent += `- ${cellRef}: ${cell.userEnteredValue.formulaValue}\n`;
              }
            });
          }
        });
      }

      fullContent += "\n---\n\n";
    }

    return fullContent;
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    throw error;
  }
}

server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
  const pageSize = 15;
  const params: any = {
    pageSize,
    fields: "nextPageToken, files(id, name, mimeType)",
  };

  if (request.params?.cursor) {
    params.pageToken = request.params.cursor;
  }

  const res = await drive.files.list(params);
  const files = res.data.files!;

  return {
    resources: files.map((file) => ({
      uri: `gdrive:///${file.id}`,
      mimeType: file.mimeType,
      name: file.name,
    })),
    nextCursor: res.data.nextPageToken,
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const fileId = request.params.uri.replace("gdrive:///", "");

  // First get file metadata to check mime type
  const file = await drive.files.get({
    fileId,
    fields: "mimeType",
  });

  // For Google Docs/Sheets/etc we need to export
  if (file.data.mimeType?.startsWith("application/vnd.google-apps")) {
    let exportMimeType: string;
    let content: string;

    switch (file.data.mimeType) {
      case "application/vnd.google-apps.spreadsheet":
        exportMimeType = "text/markdown";
        content = await getSheetData(fileId);
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: exportMimeType,
              text: content,
            },
          ],
        };
      case "application/vnd.google-apps.document":
        exportMimeType = "text/markdown";
        break;
      case "application/vnd.google-apps.presentation":
        exportMimeType = "text/plain";
        break;
      case "application/vnd.google-apps.drawing":
        exportMimeType = "image/png";
        break;
      default:
        exportMimeType = "text/plain";
    }

    if (file.data.mimeType !== "application/vnd.google-apps.spreadsheet") {
      const res = await drive.files.export(
        { fileId, mimeType: exportMimeType },
        { responseType: "text" },
      );
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: exportMimeType,
            text: res.data,
          },
        ],
      };
    }
  }

  // For regular files download content
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );
  const mimeType = file.data.mimeType || "application/octet-stream";
  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: mimeType,
          text: Buffer.from(res.data as ArrayBuffer).toString("utf-8"),
        },
      ],
    };
  } else {
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: mimeType,
          blob: Buffer.from(res.data as ArrayBuffer).toString("base64"),
        },
      ],
    };
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search",
        description: "Search for files in Google Drive",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_workbook_data",
        description: "Get complete data from all sheets in a workbook",
        inputSchema: {
          type: "object",
          properties: {
            fileId: {
              type: "string",
              description: "The ID of the Google Sheet workbook",
            },
          },
          required: ["fileId"],
        },
      },
      {
        name: "get_sheet_data",
        description: "Get complete data from a specific sheet in a workbook",
        inputSchema: {
          type: "object",
          properties: {
            fileId: {
              type: "string",
              description: "The ID of the Google Sheet workbook",
            },
            sheetName: {
              type: "string",
              description: "The name of the specific sheet",
            },
          },
          required: ["fileId", "sheetName"],
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "search") {
    const userQuery = request.params.arguments?.query as string;
    const escapedQuery = userQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const formattedQuery = `fullText contains '${escapedQuery}'`;

    const res = await drive.files.list({
      q: formattedQuery,
      pageSize: 10,
      fields: "files(id, name, mimeType, modifiedTime, size)",
    });

    const fileList = res.data.files
      ?.map((file: any) => `${file.name} (${file.mimeType})`)
      .join("\n");
    return {
      content: [
        {
          type: "text",
          text: `Found ${res.data.files?.length ?? 0} files:\n${fileList}`,
        },
      ],
      isError: false,
    };
  } else if (request.params.name === "get_workbook_data") {
    const fileId = request.params.arguments?.fileId as string;
    const content = await getSheetData(fileId);
    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
      isError: false,
    };
  } else if (request.params.name === "get_sheet_data") {
    const fileId = request.params.arguments?.fileId as string;
    const sheetName = request.params.arguments?.sheetName as string;
    
    // Get the specific sheet's data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: sheetName,
      valueRenderOption: 'FORMULA',
      dateTimeRenderOption: 'FORMATTED_STRING'
    });

    const values = response.data.values || [];
    let content = `# Sheet: ${sheetName}\n\n`;

    if (values.length > 0) {
      // Header
      content += "| " + values[0].join(" | ") + " |\n";
      content += "|" + values[0].map(() => "---").join("|") + "|\n";
      
      // Data rows
      for (let i = 1; i < values.length; i++) {
        content += "| " + values[i].join(" | ") + " |\n";
      }

      // Add formulas if present
      const metadata = await sheets.spreadsheets.get({
        spreadsheetId: fileId,
        ranges: [sheetName],
        includeGridData: true,
      });

      const gridData = metadata.data.sheets?.[0].data?.[0];
      if (gridData?.rowData) {
        content += "\n### Formulas\n\n";
        gridData.rowData.forEach((row, rowIndex) => {
          if (row.values) {
            row.values.forEach((cell, colIndex) => {
              if (cell.userEnteredValue?.formulaValue) {
                const cellRef = `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`;
                content += `- ${cellRef}: ${cell.userEnteredValue.formulaValue}\n`;
              }
            });
          }
        });
      }
    }

    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
      isError: false,
    };
  }
  throw new Error("Tool not found");
});

const credentialsPath = process.env.GDRIVE_CREDENTIALS_PATH || path.join(
  process.cwd(),
  ".gdrive-server-credentials.json"
);

const oauthPath = process.env.GDRIVE_OAUTH_PATH || path.join(
  process.cwd(),
  "gcp-oauth.keys.json"
);

debug(`OAuth path: ${oauthPath}`);
debug(`Credentials path: ${credentialsPath}`);

async function getOAuth2Client(): Promise<OAuth2Client> {
  if (!fs.existsSync(oauthPath)) {
    throw new Error(`OAuth keys not found at ${oauthPath}`);
  }
  const credentials = JSON.parse(fs.readFileSync(oauthPath, 'utf8'));
  return new google.auth.OAuth2(
    credentials.installed.client_id,
    credentials.installed.client_secret,
    'http://localhost:3000/oauth2callback'
  );
}

async function authenticateAndSaveCredentials() {
  console.error("Launching auth flow…");
  debug(`Using OAuth keys from: ${oauthPath}`);
  debug(`Will save credentials to: ${credentialsPath}`);

  const oauth2Client = await getOAuth2Client();
  const scopes = process.env.GOOGLE_SCOPES?.split(" ") || [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly"
  ];

  // Generate auth url
  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });

  // Create server to handle OAuth callback
  const server = http.createServer();
  let resolver: (value: any) => void;
  const codePromise = new Promise((resolve) => {
    resolver = resolve;
  });

  server.on('request', async (req, res) => {
    try {
      const parsedUrl = url.parse(req.url!, true);
      if (!parsedUrl.pathname?.startsWith('/oauth2callback')) {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = parsedUrl.query.code as string;
      if (code) {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Create directory if it doesn't exist
        const dir = path.dirname(credentialsPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(credentialsPath, JSON.stringify(tokens, null, 2));
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication successful!</h1><p>You can close this window.</p>');
        resolver(tokens);
      } else {
        throw new Error('No code in callback');
      }
    } catch (e) {
      console.error('Error getting tokens:', e);
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>Authentication failed!</h1><p>Please try again.</p>');
      resolver(null);
    }
  });

  // Start server
  server.listen(3000);
  debug('Server listening on port 3000');

  // Open browser
  debug('Opening browser for authentication...');
  await open(authorizeUrl);

  // Wait for auth to complete
  const tokens = await codePromise;
  server.close();

  if (!tokens) {
    throw new Error('Authentication failed');
  }

  console.error("Credentials saved. You can now run the server.");
}

async function loadCredentialsAndRunServer() {
  if (!fs.existsSync(credentialsPath)) {
    console.error(
      "Credentials not found at", credentialsPath,
      "\nPlease run with 'auth' argument first.",
    );
    process.exit(1);
  }

  debug(`Loading credentials from: ${credentialsPath}`);
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
  const oauth2Client = await getOAuth2Client();
  oauth2Client.setCredentials(credentials);
  google.options({ auth: oauth2Client });

  debug("Credentials loaded. Starting server.");
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[2] === "auth") {
  authenticateAndSaveCredentials().catch(console.error);
} else {
  loadCredentialsAndRunServer().catch(console.error);
}
