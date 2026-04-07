# typed: false
# frozen_string_literal: true

class Kib < Formula
  desc "The Headless Knowledge Compiler"
  homepage "https://github.com/keeganthomp/kib"
  version "VERSION_PLACEHOLDER"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/keeganthomp/kib/releases/download/v#{version}/kib-darwin-arm64"
      sha256 "SHA_DARWIN_ARM64_PLACEHOLDER"
    else
      url "https://github.com/keeganthomp/kib/releases/download/v#{version}/kib-darwin-x64"
      sha256 "SHA_DARWIN_X64_PLACEHOLDER"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/keeganthomp/kib/releases/download/v#{version}/kib-linux-arm64"
      sha256 "SHA_LINUX_ARM64_PLACEHOLDER"
    else
      url "https://github.com/keeganthomp/kib/releases/download/v#{version}/kib-linux-x64"
      sha256 "SHA_LINUX_X64_PLACEHOLDER"
    end
  end

  def install
    binary = stable.url.split("/").last
    bin.install binary => "kib"
  end

  test do
    system "#{bin}/kib", "--version"
  end
end
