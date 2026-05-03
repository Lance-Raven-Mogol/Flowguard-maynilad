document.addEventListener('DOMContentLoaded', () => {
    const dashboard = document.querySelector('.dashboard');
    const navLinks = document.querySelectorAll('.nav-list a');
    const viewSections = document.querySelectorAll('.view-section');
    const searchInput = document.querySelector('.search-box input');
    const logoutBtn = document.querySelector('.logout');
    const minimizeBtn = document.querySelector('.minimize');

    // Create Toast Container
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}"></i>
            <span>${message}</span>
        `;
        toastContainer.appendChild(toast);
        if (window.lucide) window.lucide.createIcons();
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Modal System
    const modals = {
        'file-complaint': {
            title: 'File New Complaint',
            body: `
                <div class="form-group">
                    <label>Issue Type</label>
                    <select id="issue-type">
                        <option>Pipe Leakage</option>
                        <option>No Water Supply</option>
                        <option>Water Quality</option>
                        <option>Billing Error</option>
                        <option>Other</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="issue-desc" placeholder="Please describe the issue in detail..."></textarea>
                </div>
                <div class="form-group">
                    <label>Urgency</label>
                    <select id="issue-urgency">
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High (Urgent)</option>
                    </select>
                </div>
            `,
            submitText: 'Submit Complaint',
            successMsg: 'Complaint filed successfully!'
        },
        'add-staff': {
            title: 'Add New Staff Member',
            body: `
                <div class="form-group">
                    <label>Full Name</label>
                    <input type="text" placeholder="Enter name">
                </div>
                <div class="form-group">
                    <label>Role</label>
                    <select>
                        <option>Zone Specialist</option>
                        <option>Technician</option>
                        <option>Inventory Officer</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Assigned Municipality</label>
                    <select>
                        <option>Boac (Capital)</option>
                        <option>Mogpog</option>
                        <option>Gasan</option>
                        <option>Buenavista</option>
                        <option>Torrijos</option>
                        <option>Santa Cruz</option>
                    </select>
                </div>
            `,
            submitText: 'Add Staff',
            successMsg: 'New staff member added successfully!'
        },
        'mrf-approve': {
            title: 'Process Material Request',
            body: `
                <div style="background: #fdf2f2; padding: 12px; border-radius: 6px; font-size: 13px; margin-bottom: 20px;">
                    <strong>Stock Alert:</strong> Water Meter G-4 is currently low on stock (5 units remaining).
                </div>
                <div class="form-group">
                    <label>Release Quantity</label>
                    <input type="number" value="1">
                </div>
                <div class="form-group">
                    <label>Authorized By</label>
                    <input type="text" value="Officer Cruz" readonly>
                </div>
            `,
            submitText: 'Approve & Issue',
            successMsg: 'Materials issued successfully!'
        },
        'job-update': {
            title: 'Update Job Progress',
            body: `
                <div class="form-group">
                    <label>Current Status</label>
                    <select>
                        <option>In Progress</option>
                        <option>Waiting Materials</option>
                        <option>Paused (Weather)</option>
                        <option>Testing / Flushing</option>
                        <option>Completed</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Work Log</label>
                    <textarea placeholder="Briefly describe work done..."></textarea>
                </div>
            `,
            submitText: 'Save Update',
            successMsg: 'Job status updated successfully!'
        },
        'view-complaint-detail': {
            title: 'Complaint Details - #C-998',
            body: `
                <div style="display: grid; gap: 20px;">
                    <div style="padding: 15px; background: #f8f9fc; border-radius: 8px; border: 1px solid #edf0f6;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <span style="font-size: 12px; color: var(--muted);">Reference ID:</span>
                            <strong style="color: var(--blue);">#C-998</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <span style="font-size: 12px; color: var(--muted);">Type:</span>
                            <strong>Pipe Leakage</strong>
                        </div>
                        <div style="margin-bottom: 10px;">
                            <span style="font-size: 12px; color: var(--muted); display: block; margin-bottom: 4px;">Description:</span>
                            <p style="margin: 0; font-size: 14px;">Main gate pipe leak near the driveway. Causing minor flooding in the garden area.</p>
                        </div>
                    </div>
                    <div>
                        <h4 style="margin: 0 0 15px; font-size: 15px;">Activity Timeline</h4>
                        <div class="timeline">
                            <div class="timeline-item">
                                <span class="timeline-dot"></span>
                                <div class="timeline-content">
                                    <strong>Investigation Started</strong>
                                    <small>02/05/2026 - Spec. Ramos assigned</small>
                                </div>
                            </div>
                            <div class="timeline-item">
                                <span class="timeline-dot"></span>
                                <div class="timeline-content">
                                    <strong>Complaint Received</strong>
                                    <small>01/05/2026 - Filed via Web Portal</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `,
            submitText: 'Close',
            successMsg: 'Viewing details complete'
        },
        'view-bill-detail': {
            title: 'Water Bill Invoice - May 2026',
            body: `
                <div style="display: grid; gap: 20px;">
                    <div style="text-align: center; padding-bottom: 10px; border-bottom: 1px solid #eee;">
                        <h4 style="margin: 0; color: var(--blue);">FlowGuard Water Services</h4>
                        <small style="color: var(--muted);">Statement of Account</small>
                    </div>
                    <div class="bill-summary">
                        <div class="bill-row"><span>Previous Reading:</span><strong>1,245 m³</strong></div>
                        <div class="bill-row"><span>Current Reading:</span><strong>1,260 m³</strong></div>
                        <div class="bill-row"><span>Total Consumption:</span><strong>15 m³</strong></div>
                    </div>
                    <div style="display: grid; gap: 8px;">
                        <div class="bill-row"><span>Basic Charge:</span><span>P 850.00</span></div>
                        <div class="bill-row"><span>Environmental Fee:</span><span>P 120.50</span></div>
                        <div class="bill-row"><span>Maintenance Fee:</span><span>P 50.00</span></div>
                        <div class="bill-row"><span>VAT (12%):</span><span>P 220.00</span></div>
                        <div class="bill-total">
                            <div class="bill-row"><span>TOTAL AMOUNT DUE:</span><span>P 1,240.50</span></div>
                        </div>
                    </div>
                    <div style="font-size: 11px; color: var(--muted); background: #fff8f8; padding: 10px; border-radius: 4px; border: 1px solid #ffecec;">
                        <strong>Note:</strong> Please pay on or before May 10, 2026 to avoid a 5% late surcharge.
                    </div>
                </div>
            `,
            submitText: 'Pay Now',
            successMsg: 'Redirecting to payment gateway...'
        },
        'investigation-process': {
            title: 'Process Investigation - #C-998',
            body: `
                <div style="background: #eaf4ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #d0e7ff;">
                    <strong style="display: block; font-size: 14px; color: var(--blue);">Case Brief: Major Leakage</strong>
                    <p style="margin: 5px 0 0; font-size: 13px; color: #5a718a;">Reported at Phase 1, B5 L2. Customer reports water surfacing from driveway.</p>
                </div>
                <div class="form-group">
                    <label>Investigation Findings</label>
                    <textarea id="finding-desc" placeholder="Describe what you found on site..."></textarea>
                </div>
                <div class="form-group">
                    <label>Action Required</label>
                    <select id="action-req">
                        <option>Immediate Repair Required</option>
                        <option>Schedule for Replacement</option>
                        <option>No Action Needed (False Alarm)</option>
                        <option>External Issue (Refer to LGU)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Estimated Materials Needed</label>
                    <input type="text" placeholder="e.g., 2x 2\" PVC, 1x Coupling">
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div class="form-group">
                        <label>Priority Level</label>
                        <select>
                            <option>High</option>
                            <option>Medium</option>
                            <option>Low</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Investigation Photo</label>
                        <div style="border: 2px dashed #e5e8ef; border-radius: 6px; height: 42px; display: grid; place-items: center; cursor: pointer; color: var(--muted); font-size: 12px;">
                            Click to upload
                        </div>
                    </div>
                </div>
            `,
            submitText: 'Submit Findings',
            successMsg: 'Investigation report submitted successfully!'
        },
        'start-inspection': {
            title: 'Start New Zone Inspection',
            body: `
                <div style="background: #f0f7ff; padding: 12px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid var(--blue); display: flex; align-items: center; gap: 12px;">
                    <i data-lucide="info" style="color: var(--blue); width: 20px;"></i>
                    <p style="margin: 0; font-size: 13px; color: #3b5a7a;">Fill out the details below to initiate a formal site investigation.</p>
                </div>
                <div class="form-group">
                    <label style="font-weight: 600; margin-bottom: 6px; display: block;">Target Municipality</label>
                    <div style="position: relative;">
                        <select style="width: 100%; padding: 10px 12px; border: 1px solid #dce2eb; border-radius: 6px; font-family: inherit; appearance: none; background: #fff;">
                            <option>Boac (Capital)</option>
                            <option>Mogpog</option>
                            <option>Gasan</option>
                            <option>Buenavista</option>
                            <option>Torrijos</option>
                            <option>Santa Cruz</option>
                        </select>
                        <i data-lucide="chevron-down" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); width: 16px; color: var(--muted); pointer-events: none;"></i>
                    </div>
                </div>
                <div class="form-group">
                    <label style="font-weight: 600; margin-bottom: 6px; display: block;">Specific Location / Address</label>
                    <input type="text" placeholder="e.g., Block 12 Lot 4, Riverside Subd." style="width: 100%; padding: 10px 12px; border: 1px solid #dce2eb; border-radius: 6px; font-family: inherit;">
                </div>
                <div class="form-group">
                    <label style="font-weight: 600; margin-bottom: 12px; display: block; color: var(--text);">Inspection Category</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <label style="position: relative; cursor: pointer; display: block;">
                            <input type="radio" name="ins-type" checked style="position: absolute; opacity: 0; width: 0; height: 0;">
                            <div class="category-tile" style="padding: 14px; border: 1.5px solid #edf0f6; border-radius: 10px; display: flex; flex-direction: column; gap: 8px; transition: all 0.2s; background: #fff;">
                                <i data-lucide="calendar-check" style="width: 20px; color: var(--blue);"></i>
                                <div>
                                    <strong style="display: block; font-size: 13px; color: var(--text);">Routine Check</strong>
                                    <small style="font-size: 11px; color: var(--muted);">Scheduled zone monitoring</small>
                                </div>
                            </div>
                        </label>
                        <label style="position: relative; cursor: pointer; display: block;">
                            <input type="radio" name="ins-type" style="position: absolute; opacity: 0; width: 0; height: 0;">
                            <div class="category-tile" style="padding: 14px; border: 1.5px solid #edf0f6; border-radius: 10px; display: flex; flex-direction: column; gap: 8px; transition: all 0.2s; background: #fff;">
                                <i data-lucide="droplet" style="width: 20px; color: var(--pink);"></i>
                                <div>
                                    <strong style="display: block; font-size: 13px; color: var(--text);">Leakage Report</strong>
                                    <small style="font-size: 11px; color: var(--muted);">Reported pipe bursts/leaks</small>
                                </div>
                            </div>
                        </label>
                        <label style="position: relative; cursor: pointer; display: block;">
                            <input type="radio" name="ins-type" style="position: absolute; opacity: 0; width: 0; height: 0;">
                            <div class="category-tile" style="padding: 14px; border: 1.5px solid #edf0f6; border-radius: 10px; display: flex; flex-direction: column; gap: 8px; transition: all 0.2s; background: #fff;">
                                <i data-lucide="gauge" style="width: 20px; color: var(--cyan);"></i>
                                <div>
                                    <strong style="display: block; font-size: 13px; color: var(--text);">Meter Audit</strong>
                                    <small style="font-size: 11px; color: var(--muted);">Calibration and accuracy check</small>
                                </div>
                            </div>
                        </label>
                        <label style="position: relative; cursor: pointer; display: block;">
                            <input type="radio" name="ins-type" style="position: absolute; opacity: 0; width: 0; height: 0;">
                            <div class="category-tile" style="padding: 14px; border: 1.5px solid #edf0f6; border-radius: 10px; display: flex; flex-direction: column; gap: 8px; transition: all 0.2s; background: #fff;">
                                <i data-lucide="shield-alert" style="width: 20px; color: #f59e0b;"></i>
                                <div>
                                    <strong style="display: block; font-size: 13px; color: var(--text);">Illegal Usage</strong>
                                    <small style="font-size: 11px; color: var(--muted);">Unauthorized connection check</small>
                                </div>
                            </div>
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <label style="font-weight: 600; margin-bottom: 6px; display: block;">Preliminary Notes</label>
                    <textarea placeholder="Briefly describe the purpose of this inspection..." style="width: 100%; padding: 10px 12px; border: 1px solid #dce2eb; border-radius: 6px; height: 80px; font-family: inherit; resize: none;"></textarea>
                </div>
            `,
            submitText: 'Launch Inspection',
            successMsg: 'Inspection task created successfully!'
        },
        'submit-report': {
            title: 'Submit New Field Report',
            body: `
                <div class="form-group">
                    <label>Municipality</label>
                    <select>
                        <option>Boac</option>
                        <option>Mogpog</option>
                        <option>Gasan</option>
                        <option>Buenavista</option>
                        <option>Torrijos</option>
                        <option>Santa Cruz</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Inspection Category</label>
                    <select>
                        <option>Routine Check</option>
                        <option>Leakage Report</option>
                        <option>Meter Audit</option>
                        <option>Illegal Usage</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Findings Summary</label>
                    <textarea placeholder="Provide a brief summary of your findings..."></textarea>
                </div>
                <div class="form-group">
                    <label>Detailed Observations</label>
                    <textarea style="height: 100px;" placeholder="Describe technical details, measurements, and recommended actions..."></textarea>
                </div>
                <div class="form-group">
                    <label>Upload Supporting Photos</label>
                    <div style="border: 2px dashed #e5e8ef; border-radius: 8px; padding: 20px; text-align: center; color: var(--muted); cursor: pointer;">
                        <i data-lucide="upload-cloud" style="width: 32px; height: 32px; margin-bottom: 8px;"></i>
                        <p style="margin: 0; font-size: 13px;">Click or drag photos to upload</p>
                    </div>
                </div>
            `,
            submitText: 'Submit Report',
            successMsg: 'Field report submitted and queued for approval.'
        },
        'manage-staff': {
            title: 'Manage Staff Member',
            body: `
                <div class="form-group">
                    <label>Assigned Municipality</label>
                    <select>
                        <option>Boac</option>
                        <option>Mogpog</option>
                        <option>Gasan</option>
                        <option>Buenavista</option>
                        <option>Torrijos</option>
                        <option>Santa Cruz</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Change Status</label>
                    <select>
                        <option>Active in Field</option>
                        <option>At Office</option>
                        <option>On Leave</option>
                        <option>Suspended</option>
                    </select>
                </div>
            `,
            submitText: 'Update Staff',
            successMsg: 'Staff profile updated successfully.'
        },
        'order-inventory': {
            title: 'Order Replenishment',
            body: `
                <div class="form-group">
                    <label>Select Supplier</label>
                    <select id="order-vendor">
                        <option>AquaSupplies Philippines Inc.</option>
                        <option>PipeMaster Manufacturing Co.</option>
                        <option>Marinduque General Hardware</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Order Quantity</label>
                    <input type="number" id="order-qty" value="100">
                </div>
                <div class="form-group">
                    <label>Urgency</label>
                    <select id="order-urgency">
                        <option>Standard</option>
                        <option>Expedited (Critical Low)</option>
                    </select>
                </div>
            `,
            submitText: 'Create PO',
            successMsg: 'Purchase order generated and sent.'
        },
        'generate-report': {
            title: 'Generate Custom Report',
            body: `
                <div class="form-group">
                    <label>Report Type</label>
                    <select>
                        <option>Executive Summary</option>
                        <option>Financial (Capex/Opex)</option>
                        <option>Technical Analysis</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Date Range</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="date" style="flex: 1;">
                        <input type="date" style="flex: 1;">
                    </div>
                </div>
            `,
            submitText: 'Generate Report',
            successMsg: 'Report generated and ready for download.'
        },
        'new-po': {
            title: 'Create Purchase Order',
            body: `
                <div class="form-group">
                    <label>Vendor Name</label>
                    <input type="text" id="po-vendor" placeholder="e.g., AquaSupplies Inc.">
                </div>
                <div class="form-group">
                    <label>Order Details / Items</label>
                    <textarea id="po-details" style="height: 80px;" placeholder="List items, SKUs, and quantities..."></textarea>
                </div>
                <div class="form-group">
                    <label>Estimated Value</label>
                    <input type="text" id="po-value" placeholder="P 0.00">
                </div>
            `,
            submitText: 'Issue PO',
            successMsg: 'Purchase order issued to vendor.'
        },
        'register-vendor': {
            title: 'Register New Preferred Vendor',
            body: `
                <div class="form-group">
                    <label>Company Name</label>
                    <input type="text" id="vendor-name" placeholder="Legal business name">
                </div>
                <div class="form-group">
                    <label>Asset Category</label>
                    <select id="vendor-category">
                        <option>Main Lines & Pumps</option>
                        <option>Fittings & PVC</option>
                        <option>Tools & Safety Gear</option>
                        <option>Electrical Components</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Primary Contact Person</label>
                    <input type="text" id="vendor-contact" placeholder="Full Name">
                </div>
                <div class="form-group">
                    <label>Business Address</label>
                    <textarea id="vendor-address" style="height: 60px;" placeholder="Office / Warehouse address"></textarea>
                </div>
            `,
            submitText: 'Register Vendor',
            successMsg: 'Vendor registered and added to directory.'
        },
        'add-material': {
            title: 'Add New Material',
            body: `
                <div class="form-group">
                    <label>Item Name</label>
                    <input type="text" id="new-item-name" placeholder="e.g., Chlorine Drum">
                </div>
                <div class="form-group">
                    <label>Category</label>
                    <select id="new-item-cat">
                        <option>Pipes</option>
                        <option>Meters</option>
                        <option>Fittings</option>
                        <option>Consumables</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Initial Stock</label>
                    <input type="number" id="new-item-stock" value="10">
                </div>
            `,
            submitText: 'Add Item',
            successMsg: 'New material added to inventory.'
        },
        'edit-material': {
            title: 'Edit Material Stock',
            body: `
                <div class="form-group">
                    <label>Adjust Stock Level</label>
                    <input type="number" id="edit-item-stock" placeholder="Enter new total quantity">
                </div>
                <div class="form-group">
                    <label>Update Status</label>
                    <select>
                        <option>In Stock</option>
                        <option>Low Stock</option>
                        <option>Out of Stock</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Reason for Adjustment</label>
                    <textarea placeholder="e.g., Manual physical audit correction"></textarea>
                </div>
            `,
            submitText: 'Save Changes',
            successMsg: 'Material stock updated.'
        },
        'view-mrf-log': {
            title: 'MRF Release Log',
            body: `
                <div style="background: #f8f9fc; padding: 15px; border-radius: 8px; border: 1px solid #edf0f6; font-size: 13px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--muted);">MRF Reference:</span>
                        <strong>#MRF-101</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--muted);">Requested By:</span>
                        <strong>Tech Ramos</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--muted);">Issued By:</span>
                        <strong>Officer Cruz</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                        <span style="color: var(--muted);">Release Date:</span>
                        <strong>01/05/2026 09:30 AM</strong>
                    </div>
                    <strong style="display: block; margin-bottom: 5px;">Items Released:</strong>
                    <ul style="margin: 0; padding-left: 20px; color: var(--text);">
                        <li>1x Water Meter G-4</li>
                        <li>2x Brass Coupling 2"</li>
                    </ul>
                </div>
            `,
            submitText: 'Close',
            successMsg: 'Log reviewed.'
        },
        'new-mrf': {
            title: 'Create Material Request (MRF)',
            body: `
                <div class="form-group">
                    <label>Job Order Reference</label>
                    <input type="text" value="#JO-552" readonly style="background: #f8f9fc;">
                </div>
                <div class="form-group">
                    <label>Items Needed</label>
                    <textarea placeholder="e.g., 5x PVC Pipe 2\", 2x Brass Coupling..."></textarea>
                </div>
                <div class="form-group">
                    <label>Urgency</label>
                    <select>
                        <option>Standard</option>
                        <option>Urgent (Work Stalled)</option>
                    </select>
                </div>
            `,
            submitText: 'Submit MRF',
            successMsg: 'Material request submitted to Inventory.'
        },
        'check-materials': {
            title: 'Material Status - #JO-555',
            body: `
                <div style="background: #fff8f1; border: 1px solid #ffe7d3; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="display: flex; align-items: center; gap: 10px; color: #f59e0b; margin-bottom: 10px;">
                        <i data-lucide="clock" style="width: 18px;"></i>
                        <strong style="font-size: 14px;">Awaiting Preparation</strong>
                    </div>
                    <p style="margin: 0; font-size: 13px; color: #8a6d3b;">The items for this job have not yet been issued by the Inventory Officer.</p>
                </div>
                <div style="font-size: 13px;">
                    <h4 style="margin: 0 0 10px; font-size: 14px; color: var(--text);">Requested Items:</h4>
                    <ul style="margin: 0; padding-left: 20px; color: var(--muted);">
                        <li>2x Main Valve 4" (Pending)</li>
                        <li>1x Industrial Sealant (Pending)</li>
                    </ul>
                </div>
            `,
            submitText: 'Nudge Inventory',
            successMsg: 'Inventory Officer has been notified.'
        },
        'po-invoice': {
            title: 'Purchase Order Invoice',
            body: `
                <div style="padding: 20px; border: 1px dashed #dce2eb; border-radius: 8px; background: #fafbfc;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                        <strong>FlowGuard Water Services</strong>
                        <span style="color: var(--muted);">#INV-2026-882</span>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <small style="display: block; color: var(--muted);">Bill To:</small>
                        <strong>Accounts Payable Dept.</strong>
                    </div>
                    <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                        <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px 0;">PVC Pipe 2" (x50)</td><td style="text-align: right;">P 150,000</td></tr>
                        <tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px 0;">Brass Coupling (x20)</td><td style="text-align: right;">P 45,000</td></tr>
                        <tr><td style="padding: 15px 0 0;"><strong>Total Amount</strong></td><td style="text-align: right; padding: 15px 0 0;"><strong>P 195,000</strong></td></tr>
                    </table>
                </div>
            `,
            submitText: 'Download PDF',
            successMsg: 'Invoice downloaded successfully!'
        },
        'po-track': {
            title: 'Track PO Shipment',
            body: `
                <div class="timeline" style="padding: 10px 0;">
                    <div class="timeline-item">
                        <span class="timeline-dot" style="background: var(--blue);"></span>
                        <div class="timeline-content">
                            <strong>In Transit to Marinduque</strong>
                            <small>Port of Lucena - 03/05/2026</small>
                        </div>
                    </div>
                    <div class="timeline-item">
                        <span class="timeline-dot" style="background: var(--blue);"></span>
                        <div class="timeline-content">
                            <strong>Dispatched from Warehouse</strong>
                            <small>Manila Hub - 02/05/2026</small>
                        </div>
                    </div>
                    <div class="timeline-item">
                        <span class="timeline-dot"></span>
                        <div class="timeline-content">
                            <strong>Order Processed</strong>
                            <small>Supplier HQ - 01/05/2026</small>
                        </div>
                    </div>
                </div>
            `,
            submitText: 'Refresh Status',
            successMsg: 'Shipment status updated.'
        },
        'po-verify': {
            title: 'Verify & Accept Delivery',
            body: `
                <div style="background: #f0fdf4; color: #16a34a; padding: 12px; border-radius: 6px; font-size: 13px; margin-bottom: 20px; border-left: 4px solid #16a34a;">
                    Confirm that all items in this PO have been received in good condition at the Boac HQ.
                </div>
                <div class="form-group">
                    <label>Inspection Notes</label>
                    <textarea placeholder="e.g., All 50 units received, no damages noted."></textarea>
                </div>
                <div class="form-group">
                    <label>Received By</label>
                    <input type="text" value="GM Reyes" readonly>
                </div>
            `,
            submitText: 'Verify & Close PO',
            successMsg: 'PO verified and closed.'
        }
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-card">
            <div class="modal-header">
                <h3>Modal Title</h3>
                <button class="modal-close"><i data-lucide="x"></i></button>
            </div>
            <div class="modal-body"></div>
            <div class="modal-footer">
                <button class="btn-secondary modal-cancel">Cancel</button>
                <button class="btn-primary modal-submit">Submit</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    function openModal(modalKey) {
        const config = modals[modalKey];
        if (!config) return;

        overlay.querySelector('h3').textContent = config.title;
        overlay.querySelector('.modal-body').innerHTML = config.body;
        overlay.querySelector('.modal-submit').textContent = config.submitText;
        overlay.classList.add('is-active');
        if (window.lucide) window.lucide.createIcons();

        const submitBtn = overlay.querySelector('.modal-submit');
        const clearAndClose = () => {
            overlay.classList.remove('is-active');
            submitBtn.onclick = null;
        };

        const handleSubmit = () => {
            // Helper for Audit logs
            const addAudit = (actionText, itemText, changeText, color = 'var(--text)') => {
                const auditTable = document.getElementById('audit-table');
                if (auditTable) {
                    const tbody = auditTable.querySelector('tbody');
                    const newRow = document.createElement('tr');
                    const now = new Date();
                    const time = now.toLocaleDateString('en-GB') + ' ' + now.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit', hour12: false});
                    newRow.innerHTML = `<td>${time}</td><td>${actionText}</td><td>Officer Cruz</td><td>${itemText}</td><td><span style="color: ${color};">${changeText}</span></td>`;
                    tbody.insertBefore(newRow, tbody.firstChild);
                }
            };

            // Logic for specific modals
            if (modalKey === 'new-po') {
                const vendor = document.getElementById('po-vendor').value || 'Unknown Vendor';
                const value = document.getElementById('po-value').value || 'P 0.00';
                const table = document.getElementById('active-pos-table');
                if (table) {
                    const tbody = table.querySelector('tbody');
                    const newRow = document.createElement('tr');
                    const ref = `#PO-2026-${Math.floor(Math.random() * 900) + 100}`;
                    newRow.innerHTML = `
                        <td><strong>${ref}</strong></td>
                        <td>${vendor}</td>
                        <td>${value}</td>
                        <td><span class="status pending">Processing PO</span></td>
                        <td>TBD</td>
                        <td>
                            <div class="action-group">
                                <button class="btn-action" data-action="Invoice"><i data-lucide="file-text"></i> Invoice</button>
                                <button class="btn-action" data-action="Track"><i data-lucide="truck"></i> Track</button>
                            </div>
                        </td>
                    `;
                    tbody.insertBefore(newRow, tbody.firstChild);
                    if (window.lucide) window.lucide.createIcons();
                }
            } else if (modalKey === 'register-vendor') {
                const name = document.getElementById('vendor-name').value || 'New Vendor';
                const category = document.getElementById('vendor-category').value;
                const contact = document.getElementById('vendor-contact').value || 'N/A';
                const table = document.getElementById('vendor-directory-table');
                if (table) {
                    const tbody = table.querySelector('tbody');
                    const newRow = document.createElement('tr');
                    newRow.innerHTML = `
                        <td><strong>${name}</strong></td>
                        <td>${category}</td>
                        <td>${contact}</td>
                        <td><span style="color: #f59e0b; font-size: 14px;">☆☆☆☆☆</span></td>
                        <td><span class="status pending">Pending</span></td>
                        <td>
                            <div class="action-group">
                                <button class="btn-action" data-action="Details">Profile</button>
                                <button class="btn-action" data-action="Contact"><i data-lucide="mail"></i></button>
                            </div>
                        </td>
                    `;
                    tbody.insertBefore(newRow, tbody.firstChild);
                    if (window.lucide) window.lucide.createIcons();
                }
            } else if (modalKey === 'order-inventory') {
                const vendor = document.getElementById('order-vendor').value;
                const qty = document.getElementById('order-qty').value || '0';
                const poTable = document.getElementById('active-pos-table');
                const shipmentsTable = document.getElementById('shipments-table');
                
                if (poTable) {
                    const tbody = poTable.querySelector('tbody');
                    const newRow = document.createElement('tr');
                    const ref = `#PO-2026-${Math.floor(Math.random() * 900) + 100}`;
                    const value = `P ${(qty * 1200).toLocaleString()}`;
                    newRow.innerHTML = `
                        <td><strong>${ref}</strong></td>
                        <td>${vendor}</td>
                        <td>${value}</td>
                        <td><span class="status pending">Ordering Stock</span></td>
                        <td>TBD</td>
                        <td>
                            <div class="action-group">
                                <button class="btn-action" data-action="Invoice"><i data-lucide="file-text"></i> Invoice</button>
                                <button class="btn-action" data-action="Track"><i data-lucide="truck"></i> Track</button>
                            </div>
                        </td>
                    `;
                    tbody.insertBefore(newRow, tbody.firstChild);
                    if (window.lucide) window.lucide.createIcons();
                }
                
                if (shipmentsTable) {
                    const tbody = shipmentsTable.querySelector('tbody');
                    const newRow = document.createElement('tr');
                    const ref = `#SH-${Math.floor(Math.random() * 90000) + 10000}`;
                    newRow.innerHTML = `
                        <td>${ref}</td>
                        <td>${vendor}</td>
                        <td>Pending ETA</td>
                        <td><span class="status pending">Processing</span></td>
                        <td>
                            <div class="action-group">
                                <button class="btn-action" data-action="Track"><i data-lucide="map-pin"></i> Track</button>
                            </div>
                        </td>
                    `;
                    tbody.insertBefore(newRow, tbody.firstChild);
                    if (window.lucide) window.lucide.createIcons();
                }
                addAudit('Order Placed', vendor, `+${qty} units req`, '#f59e0b');
            } else if (modalKey === 'add-material') {
                const name = document.getElementById('new-item-name').value || 'New Item';
                const cat = document.getElementById('new-item-cat').value;
                const stock = document.getElementById('new-item-stock').value || '0';
                const table = document.getElementById('materials-table');
                if (table) {
                    const tbody = table.querySelector('tbody');
                    const newRow = document.createElement('tr');
                    const sku = `SKU-${Math.floor(Math.random() * 900) + 100}`;
                    const statusClass = stock > 10 ? 'paid' : 'overdue';
                    const statusText = stock > 10 ? 'In Stock' : 'Low Stock';
                    newRow.innerHTML = `
                        <td>${sku}</td><td>${name}</td><td>${cat}</td><td>${stock} units</td><td><span class="status ${statusClass}">${statusText}</span></td>
                        <td><div class="action-group"><button class="btn-action" data-action="Edit Item"><i data-lucide="edit"></i></button><button class="btn-action" data-action="Order"><i data-lucide="shopping-cart"></i></button></div></td>
                    `;
                    tbody.insertBefore(newRow, tbody.firstChild);
                    if (window.lucide) window.lucide.createIcons();
                }
                addAudit('Stock Added', name, `+${stock} units`, '#10b981');
            } else if (modalKey === 'edit-material') {
                 const stockInput = document.getElementById('edit-item-stock');
                 if(stockInput && stockInput.value) {
                     addAudit('Stock Adjusted', 'Selected Item', `Updated to ${stockInput.value}`, '#f59e0b');
                 }
            } else if (modalKey === 'mrf-approve') {
                 const mrfTable = document.getElementById('mrf-table');
                 if (mrfTable) {
                     const firstPending = mrfTable.querySelector('.status.pending');
                     if (firstPending) {
                         firstPending.className = 'status paid';
                         firstPending.textContent = 'Issued';
                         const btn = firstPending.closest('tr').querySelector('button');
                         if(btn) {
                             btn.textContent = 'View Log';
                             btn.setAttribute('data-action', 'View Log');
                         }
                     }
                 }
                 const recentMrf = document.getElementById('recent-mrf-table');
                 if (recentMrf) {
                     const firstPending = recentMrf.querySelector('.status.pending');
                     if (firstPending) {
                         firstPending.className = 'status paid';
                         firstPending.textContent = 'Issued';
                     }
                 }
                 addAudit('Stock Issued', 'Requested Items', '- Multiple units', '#ef4444');
            } else if (modalKey === 'po-verify') {
                const shipmentsTable = document.getElementById('shipments-table');
                if (shipmentsTable) {
                    const firstPending = shipmentsTable.querySelector('.status.pending');
                    if (firstPending) {
                         firstPending.className = 'status paid';
                         firstPending.textContent = 'Received';
                         const btn = firstPending.closest('tr').querySelector('button');
                         if(btn) {
                             btn.innerHTML = '<i data-lucide="check"></i> Accepted';
                             btn.disabled = true;
                         }
                    }
                }
                addAudit('Stock Received', 'Incoming PO', '+ Multiple units', '#10b981');
            } else if (modalKey === 'new-mrf') {
                const table = document.getElementById('tech-mrf-table');
                if (table) {
                    const tbody = table.querySelector('tbody');
                    const newRow = document.createElement('tr');
                    const ref = `#MRF-${Math.floor(Math.random() * 900) + 100}`;
                    const today = new Date().toLocaleDateString('en-GB');
                    newRow.innerHTML = `
                        <td>${ref}</td><td>#JO-Pending</td><td>Requested Materials</td><td>${today}</td><td><span class="status pending">Awaiting Issue</span></td>
                    `;
                    tbody.insertBefore(newRow, tbody.firstChild);
                }
            } else if (modalKey === 'start-inspection') {
                const table = document.getElementById('investigations-table');
                if (table) {
                    const tbody = table.querySelector('tbody');
                    const newRow = document.createElement('tr');
                    const id = `#C-${Math.floor(Math.random() * 900) + 100}`;
                    const today = new Date().toLocaleDateString('en-GB');
                    const rowCount = tbody.querySelectorAll('tr').length + 1;
                    newRow.innerHTML = `
                        <td>${rowCount}</td>
                        <td><strong>${id}</strong></td>
                        <td>Pending Location</td>
                        <td><span class="badge badge-medium">New Inspection</span></td>
                        <td>${today}</td>
                        <td>
                            <div class="action-group">
                                <button class="btn-action btn-blue" data-action="Process"><i data-lucide="play"></i> Process</button>
                                <button class="btn-action" data-action="View Details"><i data-lucide="eye"></i></button>
                            </div>
                        </td>
                    `;
                    tbody.insertBefore(newRow, tbody.firstChild);
                    if (window.lucide) window.lucide.createIcons();
                }
            } else if (modalKey === 'submit-report') {
                const table = document.getElementById('field-reports-table');
                if (table) {
                    const tbody = table.querySelector('tbody');
                    const newRow = document.createElement('tr');
                    const id = `#REP-${Math.floor(Math.random() * 900) + 100}`;
                    const today = new Date().toLocaleDateString('en-GB');
                    newRow.innerHTML = `
                        <td><strong>${id}</strong></td>
                        <td>${today}</td>
                        <td>Assigned Zone</td>
                        <td><span style="font-size: 11px; padding: 2px 6px; background: #f0f7ff; color: var(--blue); border-radius: 4px;">Field Report</span></td>
                        <td>Report submitted awaiting managerial review.</td>
                        <td><span class="status pending">Under Review</span></td>
                        <td>
                            <div class="action-group">
                                <button class="btn-action" data-action="View Details"><i data-lucide="eye"></i> Details</button>
                                <button class="btn-action" data-action="Download"><i data-lucide="download"></i></button>
                            </div>
                        </td>
                    `;
                    tbody.insertBefore(newRow, tbody.firstChild);
                    if (window.lucide) window.lucide.createIcons();
                }
            }

            submitBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Processing...';
            if (window.lucide) window.lucide.createIcons();
            
            setTimeout(() => {
                showToast(config.successMsg);
                clearAndClose();
            }, 1000);
        };

        submitBtn.onclick = handleSubmit;
        overlay.querySelector('.modal-cancel').onclick = clearAndClose;
        overlay.querySelector('.modal-close').onclick = clearAndClose;
    }

    // Sidebar Toggle
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
            dashboard.classList.toggle('sidebar-minimized');
            minimizeBtn.textContent = dashboard.classList.contains('sidebar-minimized') ? 'Expand' : 'Minimize';
        });
    }

    // View Switching
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const viewId = link.getAttribute('data-view');
            if (!viewId) return;
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            viewSections.forEach(section => {
                section.classList.remove('active-view');
                if (section.id === `view-${viewId}`) section.classList.add('active-view');
            });
            showToast(`Switched to ${link.textContent.trim()} view`);
        });
    });

    // Settings Sub-Navigation Tab Switching
    document.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.settings-nav button');
        if (tabBtn) {
            const tabId = tabBtn.getAttribute('data-tab');
            if (!tabId) return;

            // Update Buttons
            const nav = tabBtn.closest('.settings-nav');
            nav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');

            // Update Content
            const container = tabBtn.closest('.settings-grid').querySelector('.settings-content');
            container.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
            const target = container.querySelector(`#tab-${tabId}`);
            if (target) target.style.display = 'block';
            
            showToast(`Switched to ${tabBtn.textContent.trim()}`);
        }
    });

    // Accordion Logic for FAQs
    document.addEventListener('click', (e) => {
        const question = e.target.closest('.faq-question');
        if (question) {
            const item = question.closest('.faq-item');
            item.classList.toggle('is-open');
            const icon = question.querySelector('i');
            if (icon) {
                icon.style.transform = item.classList.contains('is-open') ? 'rotate(180deg)' : 'rotate(0deg)';
                icon.style.transition = 'transform 0.3s ease';
            }
        }
    });

    // Popover Data
    const popoverData = {
        'notifications': {
            title: 'Notifications',
            items: [
                { icon: 'info', title: 'System Maintenance', text: 'Scheduled maintenance on May 10, 10 PM.', time: '2 hours ago' },
                { icon: 'alert-circle', title: 'Bill Reminder', text: 'Your May invoice is now available.', time: '5 hours ago' },
                { icon: 'check-circle', title: 'Ticket Resolved', text: 'Complaint #C-850 has been marked as resolved.', time: '1 day ago' }
            ]
        },
        'messages': {
            title: 'Messages',
            items: [
                { icon: 'user', title: 'Officer Cruz', text: 'Material request #MRF-102 has been approved.', time: 'Just now' },
                { icon: 'user', title: 'Support Team', text: 'How can we help you today?', time: '3 hours ago' },
                { icon: 'user', title: 'Spec. Ramos', text: 'I will be at your location by 2 PM.', time: 'Yesterday' }
            ]
        }
    };

    function createPopover(type) {
        const data = popoverData[type];
        const popover = document.createElement('div');
        popover.className = `static-popover popover-${type}`;
        popover.innerHTML = `
            <div class="popover-header">
                <h4>${data.title}</h4>
                <span>Mark all as read</span>
            </div>
            <div class="popover-body">
                ${data.items.map(item => `
                    <div class="popover-item">
                        <div class="item-icon"><i data-lucide="${item.icon}"></i></div>
                        <div class="item-content">
                            <strong>${item.title}</strong>
                            <p>${item.text}</p>
                            <small>${item.time}</small>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="popover-footer">
                <a href="#">View All ${data.title}</a>
            </div>
        `;
        return popover;
    }

    // Initialize Popovers
    document.querySelectorAll('.icon-btn').forEach(btn => {
        const isBell = btn.classList.contains('bell');
        const isMsg = btn.getAttribute('aria-label') === 'Messages' || btn.querySelector('[data-lucide="message-circle"]');
        
        if (isBell || isMsg) {
            const type = isBell ? 'notifications' : 'messages';
            const wrapper = document.createElement('div');
            wrapper.className = 'popover-wrapper';
            btn.parentNode.insertBefore(wrapper, btn);
            wrapper.appendChild(btn);
            
            const popover = createPopover(type);
            wrapper.appendChild(popover);

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other popovers
                document.querySelectorAll('.static-popover').forEach(p => {
                    if (p !== popover) p.classList.remove('is-active');
                });
                popover.classList.toggle('is-active');
            });
        }
    });

    // Close popovers on click outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.static-popover').forEach(p => p.classList.remove('is-active'));
    });

    // Event Delegation for Dynamic Buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button, .icon-btn');
        if (!btn) return;

        const action = btn.getAttribute('data-action') || btn.textContent.trim();
        
        // Settings & Help Actions
        if (action === 'Save Settings') {
            const originalText = btn.textContent;
            btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Saving...';
            if (window.lucide) window.lucide.createIcons();
            setTimeout(() => {
                btn.textContent = originalText;
                showToast('Account profile updated successfully!');
            }, 1200);
        }

        if (action === 'Submit Help') {
            const originalText = btn.textContent;
            btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Sending...';
            if (window.lucide) window.lucide.createIcons();
            setTimeout(() => {
                btn.textContent = originalText;
                showToast('Your message has been sent to our support team.');
            }, 1200);
        }

        // Modal Triggers
        if (action === 'File New Complaint') openModal('file-complaint');
        if (action === 'Add New Staff') openModal('add-staff');
        if (action === 'Manage Staff') openModal('manage-staff');
        if (action === 'Order') openModal('order-inventory');
        if (action === 'Generate Report' || action === 'Generate Custom Report') openModal('generate-report');
        if (action === 'New PO' || action === 'Create Purchase Order') openModal('new-po');
        if (action === 'Register Vendor') openModal('register-vendor');
        if (action === 'Approve & Issue' || action === 'Review Pending MRFs') openModal('mrf-approve');
        if (action === 'Process') openModal('investigation-process');
        if (action === 'Start New Inspection') openModal('start-inspection');
        if (action === 'Submit New Report') openModal('submit-report');
        if (action === 'Update Progress' || action === 'Update') openModal('job-update');
        if (action === 'View Details' || action === 'Details') openModal('view-complaint-detail');
        if (action === 'View Bill') openModal('view-bill-detail');
        if (action === 'Invoice') openModal('po-invoice');
        if (action === 'Track') openModal('po-track');
        if (action === 'Verify') openModal('po-verify');
        if (action === 'Add New Item') openModal('add-material');
        if (action === 'Edit Item') openModal('edit-material');
        if (action === 'View Log') openModal('view-mrf-log');
        if (action === 'New Request') openModal('new-mrf');
        if (action === 'Check Materials') openModal('check-materials');

        // Generic Loading Actions (Downloads, Reviews, Checks)
        const genericActions = ['Download Bill', 'Download All', 'Export Stock', 'Export PDF', 'Download', 'Review', 'Weekly Summary'];
        if (genericActions.includes(action)) {
            const originalContent = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i>';
            if (window.lucide) window.lucide.createIcons();
            
            setTimeout(() => {
                btn.innerHTML = originalContent;
                if (window.lucide) window.lucide.createIcons();
                showToast(`${action} processed successfully!`);
            }, 1200);
            return;
        }

        // Simple Actions (Removed Notifications/Messages toast handlers)
    });

    // Search simulation
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Create modal
            const modal = document.createElement('div');
            modal.className = 'logout-modal';
            modal.innerHTML = `
                <div class="logout-modal-content">
                    <div class="logout-modal-header">
                        <div class="logout-modal-icon">
                            <i data-lucide="log-out" style="width: 24px; height: 24px;"></i>
                        </div>
                        <h3 class="logout-modal-title">Confirm Logout</h3>
                    </div>
                    <p class="logout-modal-message">Are you sure you want to log out? You will need to sign in again to access your dashboard.</p>
                    <div class="logout-modal-actions">
                        <button class="logout-modal-btn logout-modal-btn-cancel">Cancel</button>
                        <button class="logout-modal-btn logout-modal-btn-confirm">Log Out</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            setTimeout(() => modal.classList.add('active'), 10);
            
            if (window.lucide) window.lucide.createIcons();
            
            // Cancel button
            modal.querySelector('.logout-modal-btn-cancel').addEventListener('click', () => {
                modal.classList.remove('active');
                setTimeout(() => modal.remove(), 300);
            });
            
            // Confirm button
            modal.querySelector('.logout-modal-btn-confirm').addEventListener('click', () => {
                window.location.href = '../../../index.html';
            });
            
            // Click outside to close
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    setTimeout(() => modal.remove(), 300);
                }
            });
        });
    }

    if (window.lucide) window.lucide.createIcons();
});

// Helper for spinner animation
const style = document.createElement('style');
style.textContent = `
    .animate-spin { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    
    /* Category Tile Selection Styles */
    input[type="radio"]:checked + .category-tile {
        border-color: var(--blue) !important;
        background: #f0f7ff !important;
        box-shadow: 0 0 0 1px var(--blue);
    }
    .category-tile:hover {
        border-color: var(--blue);
        background: #f8fbff;
    }
`;
document.head.appendChild(style);