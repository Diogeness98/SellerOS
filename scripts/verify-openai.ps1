$ErrorActionPreference = 'Stop'

$config = Get-Content -Raw (Join-Path $PSScriptRoot '..\wrangler.jsonc') | ConvertFrom-Json
$model = [string]$config.vars.OPENAI_MODEL
if ($model -ne 'gpt-5.6-luna') { throw 'OPENAI_MODEL must be configured as gpt-5.6-luna.' }

$schema = @{
  type = 'object'
  additionalProperties = $false
  properties = @{
    ok = @{ type = 'boolean' }
    message = @{ type = 'string'; const = 'selleros' }
  }
  required = @('ok', 'message')
}

$secureKey = Read-Host -Prompt 'OpenAI API key' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $payload = @{
    model = $model
    store = $false
    tools = @()
    max_output_tokens = 64
    instructions = 'Return only the required JSON Schema object. This is a synthetic SellerOS connectivity test. Do not use tools or external data.'
    input = 'Return {"ok":true,"message":"selleros"}.'
    text = @{ format = @{ type = 'json_schema'; name = 'selleros_openai_health'; strict = $true; schema = $schema } }
  } | ConvertTo-Json -Depth 10 -Compress

  try {
    $response = Invoke-RestMethod -Uri 'https://api.openai.com/v1/responses' -Method Post -Headers @{ Authorization = "Bearer $apiKey"; 'Content-Type' = 'application/json' } -Body $payload
    $outputText = @($response.output | ForEach-Object { $_.content } | Where-Object { $_.type -eq 'output_text' } | Select-Object -First 1).text
    $output = $outputText | ConvertFrom-Json
    $properties = @($output.PSObject.Properties.Name)
    $structuredOutput = $response.model -eq $model -and $properties.Count -eq 2 -and $properties -contains 'ok' -and $properties -contains 'message' -and $output.ok -is [bool] -and $output.ok -eq $true -and $output.message -is [string] -and $output.message -eq 'selleros'
    [pscustomobject]@{ requests = 1; preferredModel = $model; validatedModel = if ($structuredOutput) { $response.model } else { $null }; success = $structuredOutput; structuredOutput = $structuredOutput; httpStatus = 200; errorCode = $null } | ConvertTo-Json -Compress
  } catch {
    $status = 0
    $errorCode = $null
    if ($_.Exception.Response) {
      try {
        $status = [int]$_.Exception.Response.StatusCode
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $errorCode = [string](($reader.ReadToEnd() | ConvertFrom-Json).error.code)
      } catch {}
    }
    [pscustomobject]@{ requests = 1; preferredModel = $model; validatedModel = $null; success = $false; structuredOutput = $false; httpStatus = $status; errorCode = $errorCode } | ConvertTo-Json -Compress
  }
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $apiKey = $null
  $secureKey = $null
}
