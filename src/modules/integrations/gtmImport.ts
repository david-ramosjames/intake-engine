// Build a Google Tag Manager container-import JSON for a firm. Importing it
// creates a Custom Event trigger + a GA4 Event tag for each of our dataLayer
// events, plus a "GA4 Measurement ID" constant the tags reference. The firm
// imports this into their own GTM container (Admin → Import Container).

export const GTM_EVENTS: { event: string; label: string; desc: string }[] = [
  { event: "consult_flow_open", label: "Consult Flow Open", desc: "Landing page opened / viewed" },
  { event: "consult_flow_start", label: "Consult Flow Start", desc: "Visitor started interacting with the flow" },
  { event: "form_submission", label: "Form Submission", desc: "Landing-page callback form submitted" },
  { event: "consult_flow_complete", label: "Consult Flow Complete", desc: "Lead completed (form or guided flow)" },
  { event: "consult_flow_phone_click", label: "Consult Flow Phone Click", desc: "Call button on the ending screen tapped" },
];

export function buildGtmContainerImport(opts: {
  firmName?: string;
  gtmPublicId?: string;
  ga4Id?: string;
}): unknown {
  const firm = opts.firmName?.trim() || "Intake Engine";
  const publicId = opts.gtmPublicId?.trim() || "GTM-XXXXXXX";
  const ga4 = opts.ga4Id?.trim() || "G-XXXXXXX";

  const variable = [
    {
      accountId: "0",
      containerId: "0",
      variableId: "1",
      name: "GA4 Measurement ID",
      type: "c", // Constant
      parameter: [{ type: "TEMPLATE", key: "value", value: ga4 }],
    },
  ];

  const trigger = GTM_EVENTS.map((e, i) => ({
    accountId: "0",
    containerId: "0",
    triggerId: String(100 + i),
    name: `CE - ${e.event}`,
    type: "CUSTOM_EVENT",
    customEventFilter: [
      {
        type: "EQUALS",
        parameter: [
          { type: "TEMPLATE", key: "arg0", value: "{{_event}}" },
          { type: "TEMPLATE", key: "arg1", value: e.event },
        ],
      },
    ],
  }));

  const tag = GTM_EVENTS.map((e, i) => ({
    accountId: "0",
    containerId: "0",
    tagId: String(200 + i),
    name: `GA4 Event - ${e.label}`,
    type: "gaawe", // Google Analytics: GA4 Event
    parameter: [
      { type: "TEMPLATE", key: "eventName", value: e.event },
      { type: "TEMPLATE", key: "measurementIdOverride", value: "{{GA4 Measurement ID}}" },
      { type: "BOOLEAN", key: "sendEcommerceData", value: "false" },
    ],
    firingTriggerId: [String(100 + i)],
  }));

  return {
    exportFormatVersion: 2,
    exportTime: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    containerVersion: {
      container: {
        accountId: "0",
        containerId: "0",
        name: `${firm} — Consult Flow Events`,
        publicId,
        usageContext: ["WEB"],
      },
      tag,
      trigger,
      variable,
    },
  };
}
