#!/usr/bin/env ruby
require 'webrick'
root = File.expand_path('../..', __FILE__)
port = (ARGV[0] || 7700).to_i
server = WEBrick::HTTPServer.new(Port: port, DocumentRoot: root, AccessLog: [], Logger: WEBrick::Log.new($stderr, WEBrick::Log::ERROR))
trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }
puts "Serving #{root} at http://localhost:#{port}"
server.start
