this is simple project to use webshare proxy list to proxy rss feed request through residential proxies.
stack: bun + ts, bun package manager, bun for testing

entities
ProxyProvider - class which has shared interface to be used the ProxyManager, handles services authentication and working with service api
ProxyManager - can have one or more providers, reads provider.getConfig() which returns how many times to load and rotate,
ProxyHTTPClient - use proxy manager to get required proxy url and then does request and returns the data
DomainRouter - accepts domain name, resolves its ip using headdoff.sgamidinov.com/ip/<ip>, which will provide information about the region, this information is cached for 1 hour.

how does this work
app starts, triggers the ProxyHTTPClient.setup
which will pull the ProxyManager and which will ask the providers to pull data

incoming request is like GET http://proxy.com/url=Base64Valid&kind=rss-feed url
most expected request are get method based. should have support for head requests too
decodes the base64 encoded url which can be something like https://rss.feeed.it/news/latest
new URL(url)
get domain
ask the DomainRouter to get ip infromation of the resource
ask the ProxyHTTPClient to use {url, method, region} to handle the request
the providers provider region based http proxy server list
the ProxyManager when called .proxyFor(region, fallbackRegion) returns region related, otherwise the fallbackRegion is returned
the the ProxyHTTPClient builds solid proxy request using provided credentials and url and gets the data
this whole thing should handle request and response transparently
which means we accept headers from coming request and append them to the proxied request, same for the response headers, cookies included

use ts, no dumb comments, decoupled code, proper dependejncey inject,
for now only webshare proxy provider will be available, use
use bun for running, implementation, and building, to run in docker use alpine and bun single file builds
add proper logging for every single action in the app, use logging for better observability for request proxy lifecycle
support 429 respnses with proper limiting to avoid further blocks, in this case the server should return an empty valid response, which is empty xml feed.
this whole project is for rss feed, which is handled using the query param
