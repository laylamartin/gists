const secretKey = "..."
const chargebeeKey = "..."

const chargebeeURL = "https://laylamartin-test.chargebee.com/api/v2"
const redirectURL = "https://laylamartin.thinkific.com/account"

addEventListener("fetch", (event) => {
  event.respondWith(
    handleRequest(event.request).catch(
      (err) => new Response(err.stack, { status: 500 })
    )
  )
})

async function handleRequest(request) {
  const url = new URL(request.url)

  if (! url.pathname.startsWith("/sso/thinkific-chargebee")) {
    return new Response("Not Found", { status: 404 })
  }

  if (! url.searchParams.has("email") || ! url.searchParams.has("secret") || ! url.searchParams.has("expiry")) {
    return new Response("Missing parameter", { status: 400 })
  }

  const email = url.searchParams.get("email")
  const emailEncoded = encodeURIComponent(email)
  const expiry = Number(url.searchParams.get("expiry"))
  const signature = url.searchParams.get("secret")
  const secretKey = "squad-taps-earphone-sleek"

  const encoder = new TextEncoder()

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    )

    const verified = await crypto.subtle.verify(
      "HMAC",
      key,
      hexStringToUint8Array(signature),
      encoder.encode(email + expiry),
    )

    if (! verified) {
      return new Response("Invalid signature", { status: 403 })
    }

    if (Date.now() > (expiry * 1000)) {
      return new Response("Link expired", { status: 403 })
    }

    const customerResponse = await fetch(`${chargebeeURL}/customers?email[is]=${emailEncoded}`, {
        headers: { "Authorization": `Basic ${chargebeeKey}` },
    })

    if (! customerResponse.ok) {
      return new Response("Failed to fetch customer", { status: 500 })
    }

    const customers = await customerResponse.json()

    if (! customers.list) {
      return new Response("Error fetching customer", { status: 500 })
    }

    if (! customers.list.length) {
      return new Response(`No customer found with the email: ${email}`, { status: 404 })
    }

    const sessionResponse = await fetch(`${chargebeeURL}/portal_sessions?email[is]=${emailEncoded}`, {
        method: "POST",
        headers: { "Authorization": `Basic ${chargebeeKey}` },
        body: new URLSearchParams({
          "customer[id]": customers.list[0].customer.id,
          "redirect_url": redirectURL,
        })
    })

    if (! sessionResponse.ok) {
      return new Response("Failed to create session", { status: 500 })
    }

    const session = await sessionResponse.json()

    if (! session.portal_session) {
      return new Response("Error creating session", { status: 500 })
    }

    return Response.redirect(
      session.portal_session.access_url
    )
  } catch (err) {
    return new Response(`Something went wrong. ${err.message}`, { status: 500 })
  }
}

function hexStringToUint8Array(hexString) {
  var arrayBuffer = new Uint8Array(hexString.length / 2)

  for (var i = 0; i < hexString.length; i += 2) {
    arrayBuffer[i/2] = parseInt(hexString.substr(i, 2), 16)
  }

  return arrayBuffer
}
