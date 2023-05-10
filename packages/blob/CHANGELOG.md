# @vercel/blob

## 0.8.1

### Patch Changes

- Add missing url in blob type

## 0.8.0

### Minor Changes

- feat(API): Cleanup API responses

## 0.7.0

### Minor Changes

- 543a52e: restore list

## 0.6.3

### Patch Changes

- 5059992: remove list

## 0.6.2

### Patch Changes

- afa1e7a: send content-type

## 0.6.1

### Patch Changes

- fix vercelBlob.del to send back a single object or array when relevant to input

## 0.6.0

### Minor Changes

- del will now send back `HeadBlobResult | (HeadBlobResult | null)[] | null` based on how it's used and which blobs were deleted or not

## 0.5.0

### Minor Changes

- 45fd785: Implement bulk delete

## 0.4.0

### Minor Changes

- Add error handling

## 0.3.2

### Patch Changes

- Handle access denied deletions

## 0.3.1

### Patch Changes

- Release again

## 0.3.0

### Minor Changes

- e29855d: add blob list

## 0.2.6

### Patch Changes

- 5f6fe14: Test new release

## 0.2.5

### Patch Changes

- Test changeset in monorepo

## 0.2.4

### Patch Changes

- 39b15f2: Move from BLOB_STORE_WRITE_TOKEN to BLOB_READ_WRITE_TOKEN

## 0.2.1

### Patch Changes

- 969ef14: Fix filename computation

## 0.2.0

### Minor Changes

- a0f5d03: Added new methods

## 0.1.3

### Patch Changes

- e7e259e: Test releasing

## 0.1.0

### Minor Changes

- 33b712b: First "version"

## 0.0.2

### Patch Changes

- d1ec473: Testing changeset
- c33db99: Testing publish
