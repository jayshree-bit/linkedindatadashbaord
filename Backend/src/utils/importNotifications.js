import ImportNotification from '../models/ImportNotification.js';

export async function emitImportCompleted(
  io,
  {
    uploaderName,
    type,
    totalImported = 0,
    qualifiedCount = 0,
    disqualifiedCount = 0,
    companyCount = 0,
    status = 'success',
    message,
  }
) {
  const notification = await ImportNotification.create({
    type,
    uploaderName: uploaderName || 'Unknown user',
    totalImported,
    qualifiedCount,
    disqualifiedCount,
    companyCount,
    status,
    message: message || '',
  });

  const payload = {
    ...notification.toObject(),
    id: notification._id.toString(),
  };

  if (io) {
    io.emit('import:notification', payload);
  }

  return payload;
}