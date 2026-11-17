# Recommendations API

The map page gets the model's recommendations from one HTTP endpoint and reports the supervisor's decisions to another. Until the model server exists, the page uses a built-in sample (`data/sample-recommendations.js`) in exactly this format, so switching to the real server is a one-line change.

## Connecting the real server

In `js/map/recommendations-api.js`, set:

```js
const CONFIG = {
  baseUrl: 'http://localhost:8000/api',   // was null (sample mode)
  pollSeconds: 60
};
```

The page then calls `GET {baseUrl}/recommendations` every `pollSeconds` and `POST {baseUrl}/decisions` after each accept or override. If the server runs on a different address from the page, it must allow cross-origin requests (CORS).

## GET /recommendations

Returns the latest prediction run.

```json
{
  "generated_at": "2026-11-17T13:47:00Z",
  "model_version": "mast-gnn-0.3",
  "step_min": 5,
  "horizon_min": 60,
  "thresholds": { "low": 0.30, "high": 0.75 },
  "recommendations": [
    {
      "id": "run-1347-split-S6",
      "action": "split",
      "sectors": ["S6"],
      "effective_at": "2026-11-17T14:07:00Z",
      "forecast": { "S6": [0.52, 0.56, 0.61, 0.67, 0.73, 0.79, 0.86, 0.90, 0.88, 0.84, 0.80, 0.77, 0.74] },
      "proposed": [
        { "id": "S6a", "polygon": [[54.18, 25.09], [55.12, 24.91], [54.6, 24.4]], "floor": 0, "ceiling": 460, "predicted_level": "busy" },
        { "id": "S6b", "polygon": [[53.46, 24.33], [54.6, 24.4], [54.77, 23.61]], "floor": 0, "ceiling": 460, "predicted_level": "busy" }
      ]
    },
    { "id": "run-1347-keep", "action": "keep", "sectors": ["S2", "S3", "S4", "S5"] }
  ]
}
```

| Field | Meaning |
|---|---|
| `generated_at` | When the model made this run (UTC, ISO 8601). Forecast value 0 is this moment. |
| `model_version` | Saved with every decision, so decisions can be traced to the model that produced them. |
| `step_min`, `horizon_min` | Spacing and length of each forecast. 5 and 60 give 13 values. |
| `thresholds` | The low and high complexity limits, in the same units as the forecast. |
| `id` | Unique per recommendation. The page never asks about the same id twice. |
| `action` | `split`, `merge` or `keep`. Only split and merge are reviewed. |
| `sectors` | The current sectors the action applies to (one for split, two or more for merge). |
| `effective_at` | When the new configuration should be in place. Used to sort by urgency. |
| `forecast` | Predicted complexity for each sector in `sectors`, one value per step. |
| `proposed` | The sectors that would replace `sectors`: outline as `[longitude, latitude]` points (not closed), vertical limits in flight levels, and the predicted level (`normal`, `busy` or `overloaded`). |

The page writes the "why" sentence and draws the chart from `forecast` and `thresholds`, so the explanation always matches the numbers.

## POST /decisions

Sent once per decision.

```json
{
  "recommendation_id": "run-1347-split-S6",
  "action": "split",
  "sectors": ["S6"],
  "decision": "overridden",
  "reason": "no-controller",
  "note": "Only one controller on shift until 15:00",
  "decided_at": "2026-11-17T13:52:10Z",
  "model_version": "mast-gnn-0.3"
}
```

`decision` is `accepted` or `overridden`. Overrides always carry `reason`, one of `traffic-differs`, `no-controller`, `weather-military` or `other`, plus an optional free-text `note`. Accepted decisions have no reason.

## Open points

- **Sector shapes.** In the sample, a split cuts the sector in half and a merge joins two neighbours. These are placeholders. Real proposals should come from the GCAA's approved sector configurations for the Emirates FIR, which we need to request.
- **Complexity scale and limits.** The 0–1 index and the 0.30 / 0.75 limits are placeholders until the model's output and the sector capacity values are agreed.
- **Controllers per sector.** The page assumes one controller (or team) per open sector when it shows "1 → 2 controllers". Confirm this with the GCAA.
