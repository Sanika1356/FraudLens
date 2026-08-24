# FraudLens Roadmap Release 4

## Delivered

FraudLens now supports a preview-first transaction import workflow. Managers and administrators can upload a CSV, inspect the number of ready, invalid, and duplicate rows, review sample risk outcomes, and then commit only the ready rows.

The commit is bound to a SHA-256 hash of the previewed file. If the file changes after preview, the server rejects the commit and requires a new preview. This prevents a user interface preview from becoming detached from the file that is actually imported.

The import flow continues to skip duplicate references already present in the active workspace and duplicate references within the uploaded file. Invalid and duplicate rows are reported individually while valid rows can still be imported. Every imported assessment uses the common scoring and entity-indexing workflow.

Recent import batches are visible to managers and administrators as organization-scoped metadata. Raw CSV contents are not retained. Batch records include filename, content hash, row counts, bounded validation errors, creator metadata, status, and completion time.

## Server contract

| Procedure            | Access                                | Purpose                                                                                                     |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `risk.previewCsv`    | Organization manager or administrator | Validates the file, detects duplicates, hashes the content, stores a preview batch, and returns sample rows |
| `risk.importCsv`     | Organization manager or administrator | Revalidates the file, verifies the preview hash and batch state, and imports ready rows                     |
| `risk.importHistory` | Organization manager or administrator | Returns recent organization-scoped batch metadata without raw CSV contents                                  |

## Database migration

Apply `drizzle/0015_curvy_mentor.sql` after the earlier migrations. It creates `transactionImportBatches` with an organization/time index. No raw CSV payload is stored in the table.

## Security and data-quality boundaries

The server remains authoritative for validation, duplicate detection, content hashing, and commit state. Client-side sample results are informational only. Previewed risk levels are recalculated by the server during commit and are not trusted from the client.

Batch errors are bounded to the first 100 validation issues. Import history contains metadata only. Operators should still treat uploaded CSVs as sensitive during transit and should use approved storage and access controls around the source files.

## Validation

| Check               | Result                                      |
| ------------------- | ------------------------------------------- |
| `pnpm check`        | Passed                                      |
| `pnpm test`         | Passed: 7 files, 69 tests                   |
| `pnpm build`        | Passed: client and server bundles generated |
| `pnpm format:check` | Passed after final formatting               |
| `git diff --check`  | Passed after final formatting               |

## Usage

Open **Import Transactions**, select a `.csv` file, and choose **Preview import**. Review the ready/invalid/duplicate counts and sample rows. Choose **Import ready rows** only after confirming the preview. If the file is edited or replaced, preview it again before committing.
