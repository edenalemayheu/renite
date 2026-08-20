import mongoose from 'mongoose';

const ReportSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  material_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: true
  },
  type: {
    type: String,
    enum: ['LOST', 'FOUND'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'MATCHED', 'IN_VERIFICATION', 'RECOVERED', 'CLOSED', 'CANCELLED'],
    default: 'ACTIVE'
  },
  location: {
    latitude: { type: Number },
    longitude: { type: Number },
    place_name: { type: String },
    address: { type: String }
  },
  incident_date: {
    type: Date,
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },

  // ------------------------------------------------------------------
  // Blockchain anchoring fields (additive -- optional, never required)
  //
  // blockchain_device_id: the uint256 deviceId returned by
  //   DeviceRegistry.registerDevice(). Stored as a String because
  //   JavaScript BigInt / MongoDB NumberLong handling varies across
  //   driver versions. Sparse index avoids a null-uniqueness conflict
  //   on documents created before blockchain integration was enabled.
  //
  // blockchain_tx_hash: the transaction hash of the registerDevice()
  //   call. Useful for linking a report to its on-chain audit entry.
  //
  // These fields are populated by report.service.js after a successful
  // blockchain.service.registerDevice() call. They remain null/absent
  // when BLOCKCHAIN_ENABLED=false or when the anchoring call fails.
  // ------------------------------------------------------------------
  blockchain_device_id: {
    type: String,
    default: null,
    sparse: true,
  },
  blockchain_tx_hash: {
    type: String,
    default: null,
  },

  deleted_at: {
    type: Date,
    default: null
  }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

ReportSchema.index({ user_id: 1 });
ReportSchema.index({ status: 1 });
ReportSchema.index({ type: 1 });
ReportSchema.index({ material_id: 1 });
ReportSchema.index({ created_at: -1 });

export default mongoose.model('Report', ReportSchema);