// @ts-check
/* eslint-disable -- YOLO */

// missing: abort controller to cancel other uploads when internal error
// missing: abort controller option to allow customer to cancel upload themselves
// missing: automatically retry parts?
// missing: close streams on consumer side when required
// https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/cancel

import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';

const file = await open('/Users/vvo/Downloads/movie.mkv');
// const stream = file.readableWebStream() as ReadableStream;
const stream = Readable.toWeb(file.createReadStream());
const maxConcurrentUploads = 5;
const partSizeInBytes = 5 * 1024 * 1024;

multipartUpload(stream);

type BlobPart = {
  id: number;
  blob: Blob;
};

async function multipartUpload(stream: ReadableStream<ArrayBuffer>) {
  return new Promise(async (resolve, reject) => {
    const partsToSend: BlobPart[] = [];
    const reader = stream.getReader();
    let activeUploads = 0;
    let reading = false;
    let currentPartId = 0;
    let bytesSent = 0;

    async function read() {
      reading = true;
      let arrayBuffers: ArrayBuffer[] = [];
      let bytesRead = 0;
      while (partsToSend.length < maxConcurrentUploads * 2) {
        try {
          const { value, done } = await reader.read();
          console.log(value);
          if (done) {
            // done is sent when the stream is fully consumed. That's why we're not using the value here.
            if (arrayBuffers.length > 0) {
              partsToSend.push({
                id: currentPartId++,
                blob: new Blob(arrayBuffers),
              });
              sendParts();
            }
            reading = false;
            return;
          }

          arrayBuffers.push(value);
          bytesRead += value.byteLength;

          if (bytesRead >= partSizeInBytes) {
            partsToSend.push({
              id: currentPartId++,
              blob: new Blob(arrayBuffers),
            });
            arrayBuffers = [];
            bytesRead = 0;
            sendParts();
          }
        } catch (error) {
          reject(error);
        }
      }
      reading = false;
    }

    function sendPart(part: BlobPart) {
      bytesSent += part.blob.size;
      activeUploads++;
      fakeRequest(part)
        .then(() => {
          activeUploads--;
          if (partsToSend.length > 0) {
            sendParts();
          } else if (activeUploads === 0) {
            resolve(true);
          }

          // Resume reading if we have room for more parts
          if (!reading && partsToSend.length < maxConcurrentUploads * 2) {
            read();
          }
        })
        .catch((error) => {
          reject(error);
        });
    }

    function sendParts() {
      while (activeUploads < maxConcurrentUploads && partsToSend.length > 0) {
        const partToSend = partsToSend.shift();
        if (partToSend) {
          sendPart(partToSend);
        }
      }
    }

    await read();

    // no need to be here, for testing
    function fakeRequest(blobPart: BlobPart) {
      console.log(
        `part ${
          blobPart.id
        } - ${new Date().toISOString()} - active: ${activeUploads} - START - ${bytesToSize(
          bytesSent,
        )}`,
      );
      return new Promise((resolve) => {
        setTimeout(
          function () {
            console.log(
              `part ${
                blobPart.id
              } - ${new Date().toISOString()} - active: ${activeUploads} - END - ${bytesToSize(
                bytesSent,
              )}`,
            );
            resolve(true);
          },
          random(20, 2000),
        );
      });
    }
  });
}

function random(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function bytesToSize(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Byte';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

// async function multipartUpload(stream) {
//   const partsToSend: Blob[] = [];
//   const reader = stream.getReader();

//   async function read() {
//     let arrayBuffers: ArrayBuffer[] = [];
//     let bytesRead = 0;
//     while (partsToSend.length < maxConcurrentUploads * 2) {
//       const { value } = await reader.read();
//       arrayBuffers.push(value);
//       bytesRead += value.byteLength;

//       if (bytesRead >= partSizeInBytes) {
//         partsToSend.push(new Blob(arrayBuffers));
//         sendParts();
//         arrayBuffers = [];
//       }
//     }
//   }

//   function sendParts() {}

//   await read();
// }
